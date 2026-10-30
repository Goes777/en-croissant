import Dexie, { type Table } from "dexie";
import {
    type Exercise,
    type ExerciseAttempt,
    type ReviewEvent,
    type SourceAnchor,
    type SrsExerciseCard,
    answerSignature,
    exerciseSchema,
    type Rating,
} from "@/domain/exercises/model";
import { gradeAttempt, validateExercise } from "@/domain/exercises/grader";
import { fsrsScheduler, storedFsrsCardSchema } from "@/infrastructure/fsrs/FsrsSchedulerAdapter";
import { z } from "zod";

export const TRAINING_SCHEMA_V1 = {
    exercises: "id,kind,status,*tags",
    cards: "id,&exerciseId,dueAt,suspended",
    attempts: "id,exerciseId,finishedAt",
    events: "id,cardId,&attemptId,reviewedAt",
    settings: "key",
};
export class TrainingDatabase extends Dexie {
    exercises!: Table<Exercise, string>;
    cards!: Table<SrsExerciseCard, string>;
    attempts!: Table<ExerciseAttempt, string>;
    events!: Table<ReviewEvent, string>;
    settings!: Table<{ key: string; value: unknown }, string>;
    anchors!: Table<SourceAnchor, string>;
    exerciseVersions!: Table<
        { exerciseId: string; version: number; exercise: Exercise },
        [string, number]
    >;
    constructor(name = "ChessPraticaTraining") {
        super(name);
        this.version(1).stores(TRAINING_SCHEMA_V1);
        this.version(2)
            .stores({
                ...TRAINING_SCHEMA_V1,
                exercises: "id,kind,status,courseTitle,exerciseFamilyId,*tags",
                anchors: "id,sourceKey",
                exerciseVersions: "[exerciseId+version],exerciseId",
            })
            .upgrade(async (tx) => {
                await tx
                    .table("cards")
                    .toCollection()
                    .modify((card) => {
                        card.needsReconciliation ??= false;
                        card.activeExerciseVersion ??= 1;
                    });
                const exercises = await tx.table("exercises").toArray();
                for (const item of exercises) {
                    const exercise = exerciseSchema.parse(item);
                    await tx.table("exercises").put(exercise);
                    await tx
                        .table("exerciseVersions")
                        .put({ exerciseId: exercise.id, version: exercise.version, exercise });
                    for (const id of exercise.sourceAnchorIds)
                        await tx.table("anchors").put({
                            id,
                            sourceKey: "legacy-v1",
                            label: "Referência preservada da base anterior: " + id,
                        });
                }
            });
    }
}
export const trainingDb = new TrainingDatabase();

export async function reconcileExercises(
    db: TrainingDatabase,
    inputs: unknown[],
    anchors: SourceAnchor[] = [],
    now = new Date(),
) {
    const validated = inputs.map(validateExercise);
    if (new Set(validated.map((x) => x.id)).size !== validated.length)
        throw new Error("O pacote contém exercícios duplicados.");
    return db.transaction(
        "rw",
        [db.exercises, db.cards, db.anchors, db.exerciseVersions],
        async () => {
            const supplied = new Set(anchors.map((anchor) => anchor.id));
            for (const id of new Set(validated.flatMap((exercise) => exercise.sourceAnchorIds)))
                if (!supplied.has(id) && !(await db.anchors.get(id)))
                    throw new Error("Referência de origem ausente: " + id);
            let added = 0,
                updated = 0,
                needsReview = 0;
            for (const incoming of validated) {
                const previous = await db.exercises.get(incoming.id);
                const changedAnswer =
                    !!previous && answerSignature(previous) !== answerSignature(incoming);
                const changedContent =
                    !!previous &&
                    JSON.stringify({ ...previous, version: 0 }) !==
                        JSON.stringify({ ...incoming, version: 0 });
                const exercise = {
                    ...incoming,
                    version: previous
                        ? previous.version + (changedContent ? 1 : 0)
                        : incoming.version,
                };
                await db.exercises.put(exercise);
                await db.exerciseVersions.put({
                    exerciseId: exercise.id,
                    version: exercise.version,
                    exercise,
                });
                let card = await db.cards.where("exerciseId").equals(exercise.id).first();
                if (!card && exercise.status === "validated") {
                    const fsrsCard = fsrsScheduler.create(now);
                    card = {
                        id: "card:" + exercise.id,
                        exerciseId: exercise.id,
                        activeExerciseVersion: exercise.version,
                        fsrsCard,
                        dueAt: fsrsCard.due,
                        suspended: false,
                        needsReconciliation: false,
                    };
                    added++;
                } else if (card) {
                    if (changedAnswer) {
                        card = { ...card, suspended: true, needsReconciliation: true };
                        needsReview++;
                    } else card = { ...card, activeExerciseVersion: exercise.version };
                    if (exercise.status !== "validated") card = { ...card, suspended: true };
                }
                if (card) await db.cards.put(card);
                if (previous && changedContent) updated++;
            }
            if (anchors.length) await db.anchors.bulkPut(anchors);
            return { added, updated, needsReview };
        },
    );
}
export async function confirmReconciliation(db: TrainingDatabase, exerciseId: string) {
    return db.transaction("rw", [db.exercises, db.cards], async () => {
        const exercise = await db.exercises.get(exerciseId);
        const card = await db.cards.where("exerciseId").equals(exerciseId).first();
        if (!card || !exercise || exercise.status !== "validated")
            throw new Error("Exercício indisponível.");
        const fresh = fsrsScheduler.create(new Date());
        await db.cards.put({
            ...card,
            activeExerciseVersion: exercise.version,
            suspended: false,
            needsReconciliation: false,
            fsrsCard: fresh,
            dueAt: fresh.due,
        });
        // Attempts, review events and previous exercise versions remain immutable.
    });
}
export async function recordReview(
    db: TrainingDatabase,
    attempt: Omit<ExerciseAttempt, "correctness" | "feedback">,
    rating: Rating,
    expectedReps: number,
    reviewedAt = new Date(attempt.finishedAt),
) {
    attempt = attemptSchema.omit({ correctness: true, feedback: true }).parse(attempt);
    return db.transaction("rw", [db.exercises, db.cards, db.attempts, db.events], async () => {
        const exercise = await db.exercises.get(attempt.exerciseId);
        const card = await db.cards.where("exerciseId").equals(attempt.exerciseId).first();
        if (
            !exercise ||
            !card ||
            card.suspended ||
            exercise.status !== "validated" ||
            card.activeExerciseVersion !== exercise.version ||
            attempt.exerciseVersion !== exercise.version
        )
            throw new Error("O exercício mudou. Reabra a tentativa para reconciliar.");
        if (card.fsrsCard.reps !== expectedReps)
            throw new Error("Este cartão já foi revisto em outra sessão. Atualize a agenda.");
        if (
            !Number.isFinite(attempt.elapsedMs) ||
            attempt.elapsedMs < 0 ||
            attempt.hintsUsed < 0 ||
            attempt.errors < 0 ||
            Date.parse(attempt.finishedAt) < Date.parse(attempt.startedAt)
        )
            throw new Error("Dados da tentativa inválidos.");
        const graded = gradeAttempt(exercise, {
            moves: attempt.submittedMovesUci,
            answers: attempt.submittedAnswerIds,
            explanation: attempt.selfExplanation,
        });
        if (reviewedAt.getTime() < Date.parse(attempt.finishedAt))
            throw new Error("A avaliação não pode preceder a resposta.");
        const result = fsrsScheduler.review(card.fsrsCard, reviewedAt, rating);
        const event: ReviewEvent = {
            id: crypto.randomUUID(),
            cardId: card.id,
            attemptId: attempt.id,
            reviewedAt: reviewedAt.toISOString(),
            rating,
            fsrsLog: result.log,
            schedulerVersion: result.schedulerVersion,
        };
        await db.attempts.add({ ...attempt, ...graded });
        await db.events.add(event);
        await db.cards.put({ ...card, fsrsCard: result.card, dueAt: result.card.due });
        return event;
    });
}

const cardSchema = z.object({
    id: z.string(),
    exerciseId: z.string(),
    activeExerciseVersion: z.number().int().positive(),
    fsrsCard: storedFsrsCardSchema,
    dueAt: z.string().datetime(),
    suspended: z.boolean(),
    needsReconciliation: z.boolean(),
});
const attemptSchema = z.object({
    id: z.string(),
    exerciseId: z.string(),
    exerciseVersion: z.number().int().positive(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    submittedMovesUci: z.array(z.string()),
    submittedAnswerIds: z.array(z.string()),
    selfExplanation: z.string(),
    hintsUsed: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
    errors: z.number().int().nonnegative(),
    correctness: z.enum(["correct", "partial", "incorrect", "ungraded"]),
    feedback: z.string(),
    moveSubmissions: z
        .array(
            z.object({
                uci: z.string(),
                at: z.string().datetime(),
                fen: z.string(),
                legal: z.boolean(),
                accepted: z.boolean(),
            }),
        )
        .optional(),
    selfAssessment: z.enum(["correct", "partial", "incorrect"]).optional(),
});
const eventSchema = z.object({
    id: z.string(),
    cardId: z.string(),
    attemptId: z.string(),
    reviewedAt: z.string().datetime(),
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    fsrsLog: z.record(z.unknown()),
    schedulerVersion: z.string(),
});
export const backupSchema = z.object({
    format: z.literal("chesspratica-backup"),
    version: z.literal(1),
    createdAt: z.string().datetime(),
    exercises: z.array(exerciseSchema),
    cards: z.array(cardSchema),
    attempts: z.array(attemptSchema),
    events: z.array(eventSchema),
    anchors: z.array(
        z.object({
            id: z.string(),
            sourceKey: z.string(),
            label: z.string(),
            page: z.number().int().positive().optional(),
            excerpt: z.string().optional(),
            fingerprint: z.string().optional(),
        }),
    ),
    exerciseVersions: z.array(
        z.object({
            exerciseId: z.string(),
            version: z.number().int().positive(),
            exercise: exerciseSchema,
        }),
    ),
    settings: z.array(z.object({ key: z.string(), value: z.unknown() })),
});
export async function exportBackup(db: TrainingDatabase) {
    return db.transaction("r", db.tables, async () =>
        backupSchema.parse({
            format: "chesspratica-backup",
            version: 1,
            createdAt: new Date().toISOString(),
            exercises: await db.exercises.toArray(),
            cards: await db.cards.toArray(),
            attempts: await db.attempts.toArray(),
            events: await db.events.toArray(),
            anchors: await db.anchors.toArray(),
            exerciseVersions: await db.exerciseVersions.toArray(),
            settings: await db.settings.toArray(),
        }),
    );
}
export async function restoreBackup(db: TrainingDatabase, input: unknown) {
    const backup = backupSchema.parse(input);
    backup.exercises.forEach(validateExercise);
    const ids = new Set(backup.exercises.map((x) => x.id)),
        cards = new Map(backup.cards.map((x) => [x.id, x])),
        attempts = new Map(backup.attempts.map((x) => [x.id, x]));
    const anchors = new Set(backup.anchors.map((x) => x.id));
    if (
        backup.exercises.some((exercise) => exercise.sourceAnchorIds.some((id) => !anchors.has(id)))
    )
        throw new Error("Backup com referência de origem ausente.");
    if (
        ids.size !== backup.exercises.length ||
        cards.size !== backup.cards.length ||
        attempts.size !== backup.attempts.length ||
        new Set(backup.events.map((x) => x.id)).size !== backup.events.length ||
        new Set(backup.events.map((x) => x.attemptId)).size !== backup.events.length
    )
        throw new Error("Backup com registros duplicados.");
    if (
        backup.cards.some((x) => !ids.has(x.exerciseId) || x.dueAt !== x.fsrsCard.due) ||
        backup.attempts.some((x) => !ids.has(x.exerciseId)) ||
        backup.events.some(
            (x) =>
                !cards.has(x.cardId) ||
                !attempts.has(x.attemptId) ||
                cards.get(x.cardId)!.exerciseId !== attempts.get(x.attemptId)!.exerciseId,
        )
    )
        throw new Error("Referências inválidas no backup.");
    return db.transaction("rw", db.tables, async () => {
        // Restore is a merge; conflicts are rejected, never resolved by overwriting history.
        for (const name of [
            "exercises",
            "cards",
            "attempts",
            "events",
            "anchors",
            "exerciseVersions",
            "settings",
        ] as const) {
            const table = db.table(name);
            for (const record of backup[name]) {
                const key =
                    name === "exerciseVersions"
                        ? [
                              (record as { exerciseId: string }).exerciseId,
                              (record as { version: number }).version,
                          ]
                        : name === "settings"
                          ? (record as { key: string }).key
                          : (record as { id: string }).id;
                const existing = await table.get(key);
                if (
                    existing &&
                    name === "settings" &&
                    (record as { key: string }).key === "ui.preferences"
                ) {
                    await table.put(record);
                    continue;
                }
                if (existing && canonical(existing) !== canonical(record))
                    throw new Error(
                        `Conflito em ${name}. O backup não sobrescreveu o histórico atual.`,
                    );
                if (!existing) await table.add(record);
            }
        }
        return { exercises: backup.exercises.length, events: backup.events.length };
    });
}

function canonical(input: unknown): string {
    const ordered = (value: unknown): unknown =>
        Array.isArray(value)
            ? value.map(ordered)
            : value && typeof value === "object"
              ? Object.fromEntries(
                    Object.entries(value)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, child]) => [key, ordered(child)]),
                )
              : value;
    return JSON.stringify(ordered(input));
}

export function reviewQueue(
    exercises: Exercise[],
    cards: SrsExerciseCard[],
    now = new Date(),
    previousFamily?: string,
) {
    const byId = new Map(exercises.map((x) => [x.id, x]));
    return cards
        .filter(
            (card) =>
                !card.suspended &&
                card.dueAt <= now.toISOString() &&
                byId.get(card.exerciseId)?.status === "validated",
        )
        .sort((a, b) => {
            const af = byId.get(a.exerciseId)?.exerciseFamilyId,
                bf = byId.get(b.exerciseId)?.exerciseFamilyId;
            const familyA = !!previousFamily && af === previousFamily,
                familyB = !!previousFamily && bf === previousFamily;
            return (
                Number(familyA) - Number(familyB) ||
                a.dueAt.localeCompare(b.dueAt) ||
                (byId.get(a.exerciseId)?.order ?? 0) - (byId.get(b.exerciseId)?.order ?? 0)
            );
        });
}
