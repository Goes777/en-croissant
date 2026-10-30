import {
    emptyHeaders,
    makePgn,
    PgnParser,
    startingPosition,
    type Game,
    type PgnNodeData,
    type Node,
} from "chessops/pgn";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { makeUci } from "chessops";
import { normalizeMove, type Position } from "chessops/chess";
import { inspectCourseSource, inspectCourseGame, courseSchema } from "@/components/courses/model";
import { type Exercise, type SourceAnchor, type SrsExerciseCard, stableId } from "./model";
import { validateExercise } from "./grader";

export type ImportProposal = {
    exercises: Exercise[];
    anchors: SourceAnchor[];
    issues: { game: number; message: string }[];
    sourceKey: string;
    originalText: string;
    legacyCards?: SrsExerciseCard[];
    migrationSettings?: { key: string; value: unknown }[];
};
export async function proposePgnExercises(
    text: string,
    sourceKey: string,
    courseTitle: string,
    mode: "moves" | "concept" = "moves",
): Promise<ImportProposal> {
    if (new TextEncoder().encode(text).length > 20_000_000)
        throw new Error("Cada PGN pode ter até 20 MB.");
    inspectCourseSource(text);
    const games: Game<PgnNodeData>[] = [];
    new PgnParser((game) => games.push(game), emptyHeaders, 5_000_000).parse(text);
    const result: ImportProposal = {
        exercises: [],
        anchors: [],
        issues: [],
        sourceKey,
        originalText: text,
    };
    for (const [index, game] of games.entries()) {
        try {
            const pgn = makePgn(game),
                summary = inspectCourseGame(pgn);
            const initial = startingPosition(game.headers).unwrap();
            const lines: string[][] = [];
            const stack: { node: Node<PgnNodeData>; position: Position; moves: string[] }[] = [
                { node: game.moves, position: initial, moves: [] },
            ];
            while (stack.length) {
                const item = stack.pop()!;
                if (!item.node.children.length && item.moves.length) lines.push(item.moves);
                for (const child of [...item.node.children].reverse()) {
                    const next = item.position.clone();
                    const move = parseSan(next, child.data.san);
                    if (!move || !next.isLegal(move)) throw new Error("Lance ilegal no PGN.");
                    const uci = makeUci(normalizeMove(next, move));
                    next.play(move);
                    stack.push({ node: child, position: next, moves: [...item.moves, uci] });
                }
                if (lines.length + stack.length > 1000)
                    throw new Error(
                        "Excesso de variantes para um único exercício; divida o capítulo.",
                    );
            }
            const anchorId = await stableId(sourceKey + ":" + index);
            const comments = [
                ...(game.comments ?? []),
                ...Array.from(game.moves.mainline()).flatMap((node) => node.comments ?? []),
            ].join("\n");
            const concept = mode === "concept" || !lines.length;
            const exercise = validateExercise({
                id: await stableId("exercise:" + anchorId + ":" + mode),
                kind: concept ? "strategy-explain" : "tactic-sequence",
                title: summary.title || `Exercício ${index + 1}`,
                prompt: concept
                    ? "Descreva o plano da posição e justifique sua escolha usando as notas do estudo."
                    : "Jogue a continuação validada no PGN, incluindo as réplicas do adversário.",
                startFen: makeFen(initial.toSetup()),
                acceptedLinesUci: concept ? [] : lines,
                explanation:
                    comments ||
                    "A solução corresponde às continuações explícitas deste PGN. Acrescente uma explicação pedagógica antes de publicar o exercício.",
                hints: [],
                tags: [summary.topic || game.headers.get("ChessimoModule") || "PGN"],
                courseTitle,
                rubric: concept
                    ? [
                          {
                              criterion: "Plano e evidência",
                              explanation:
                                  comments ||
                                  "Explique o plano e compare com as notas originais. Revise o gabarito antes de publicar.",
                          },
                      ]
                    : [],
                sourceAnchorIds: [anchorId],
                studyChapterId: sourceKey + ":" + index,
                sourcePgn: pgn,
                status: "needs-review",
                version: 1,
                exerciseFamilyId: sourceKey + ":" + index,
                order: index,
            });
            result.exercises.push(exercise);
            result.anchors.push({
                id: anchorId,
                sourceKey,
                label: `${sourceKey} · partida ${index + 1}`,
            });
        } catch (error) {
            result.issues.push({
                game: index + 1,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return result;
}

export async function proposeLegacyCourse(input: unknown): Promise<ImportProposal> {
    const course = courseSchema.parse(input);
    const result: ImportProposal = {
        exercises: [],
        anchors: [],
        issues: [],
        sourceKey: "desktop-course:" + course.id,
        originalText: JSON.stringify(input),
    };
    for (const [index, lesson] of course.lessons.entries()) {
        const proposal = await proposePgnExercises(
            lesson.pgn,
            `desktop-course:${course.id}:${lesson.id}`,
            course.title,
        );
        result.exercises.push(
            ...proposal.exercises.map((exercise) => ({
                ...exercise,
                title: lesson.title,
                tags: [lesson.topic],
                studyChapterId: lesson.id,
                order: index,
            })),
        );
        result.anchors.push(...proposal.anchors);
        result.issues.push(...proposal.issues.map((issue) => ({ ...issue, game: index + 1 })));
    }
    return result;
}
export const coursePackageSchemaVersion = 1;
