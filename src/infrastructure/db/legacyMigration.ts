import { z } from "zod";
import { makeUci } from "chessops";
import { normalizeMove } from "chessops/chess";
import { parseSan } from "chessops/san";
import { type ImportProposal, proposeLegacyCourse } from "@/domain/exercises/pgn";
import { stableId } from "@/domain/exercises/model";
import { positionFromExercise, validateExercise } from "@/domain/exercises/grader";
import { courseSchema, progressSchema } from "@/components/courses/model";
import { storedFsrsCardSchema } from "@/infrastructure/fsrs/FsrsSchedulerAdapter";

const bridgeSchema = z.object({
    format: z.literal("chesspratica-migration"),
    version: z.literal(1),
    courses: z.array(z.object({ course: courseSchema, progress: progressSchema })),
    decks: z.array(
        z.object({
            key: z.string(),
            data: z.object({
                positions: z.array(
                    z.object({ fen: z.string(), answer: z.string(), card: z.record(z.unknown()) }),
                ),
                logs: z.array(z.record(z.unknown())),
            }),
        }),
    ),
});
const iso = (value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number")
        throw new Error("Data FSRS legada inválida.");
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("Data FSRS legada inválida.");
    return date.toISOString();
};
export async function proposeDesktopMigration(input: unknown): Promise<ImportProposal> {
    const bridge = bridgeSchema.parse(input);
    const result: ImportProposal = {
        sourceKey: "desktop-migration",
        originalText: JSON.stringify(input),
        exercises: [],
        anchors: [],
        issues: [],
        legacyCards: [],
        migrationSettings: [],
    };
    for (const stored of bridge.courses) {
        if (stored.progress.courseId !== stored.course.id)
            throw new Error("O progresso legado pertence a outro curso.");
        const proposal = await proposeLegacyCourse(stored.course);
        result.exercises.push(...proposal.exercises);
        result.anchors.push(...proposal.anchors);
        result.issues.push(...proposal.issues);
        result.migrationSettings!.push({
            key: "legacy-course:" + stored.course.id,
            value: {
                title: stored.course.title,
                progress: stored.progress,
                lessons: stored.course.lessons.length,
            },
        });
    }
    for (const deck of bridge.decks) {
        for (const [index, record] of deck.data.positions.entries()) {
            const position = positionFromExercise(record.fen),
                move = parseSan(position, record.answer);
            if (!move || !position.isLegal(move))
                throw new Error("Lance inválido num cartão legado: " + record.answer);
            const id = await stableId("legacy:" + deck.key + ":" + record.fen),
                anchorId = "legacy-source:" + id;
            const exercise = validateExercise({
                id,
                kind: "find-move",
                title: "Repertório importado · " + (index + 1),
                prompt: "Encontre o lance do seu repertório original.",
                startFen: record.fen,
                acceptedLinesUci: [[makeUci(normalizeMove(position, move))]],
                explanation: "Resposta preservada do repertório anterior: " + record.answer,
                tags: ["Repertório legado"],
                sourceAnchorIds: [anchorId],
                status: "validated",
                version: 1,
                courseTitle: "Repertórios do aplicativo anterior",
                order: index,
            });
            const card = storedFsrsCardSchema.parse({
                ...record.card,
                due: iso(record.card.due),
                last_review: record.card.last_review ? iso(record.card.last_review) : undefined,
            });
            result.exercises.push(exercise);
            result.anchors.push({
                id: anchorId,
                sourceKey: deck.key,
                label: "Repertório anterior · posição " + (index + 1),
            });
            result.legacyCards!.push({
                id: "card:" + id,
                exerciseId: id,
                activeExerciseVersion: 1,
                fsrsCard: card,
                dueAt: card.due,
                suspended: false,
                needsReconciliation: false,
            });
        }
        for (const [index, log] of deck.data.logs.entries())
            result.migrationSettings!.push({
                key: "legacy-review:" + (await stableId(deck.key)) + ":" + index,
                value: log,
            });
    }
    return result;
}
