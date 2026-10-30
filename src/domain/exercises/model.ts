import { z } from "zod";

export const exerciseKindSchema = z.enum([
    "tactic-sequence",
    "find-move",
    "strategy-plan-mcq",
    "strategy-plan-order",
    "strategy-explain",
    "position-evaluation",
    "endgame-technique",
]);
export const exerciseSchema = z.object({
    id: z.string().min(1),
    kind: exerciseKindSchema,
    title: z.string().min(1),
    prompt: z.string().min(1),
    startFen: z.string().min(1),
    acceptedLinesUci: z.array(z.array(z.string().min(4)).min(1)).default([]),
    acceptedAnswerIds: z.array(z.string()).default([]),
    options: z
        .array(z.object({ id: z.string(), label: z.string(), explanation: z.string() }))
        .default([]),
    rubric: z
        .array(
            z.object({
                criterion: z.string(),
                explanation: z.string(),
                weight: z.number().positive().optional(),
            }),
        )
        .default([]),
    explanation: z.string().min(1),
    hints: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    difficultyLabel: z.string().optional(),
    exerciseFamilyId: z.string().optional(),
    studyChapterId: z.string().optional(),
    sourceAnchorIds: z.array(z.string()).default([]),
    status: z.enum(["draft", "needs-review", "validated", "archived"]),
    version: z.number().int().positive(),
    goal: z.enum(["line", "checkmate"]).default("line"),
    sourcePgn: z.string().optional(),
    courseTitle: z.string().default("Meus exercícios"),
    order: z.number().int().nonnegative().default(0),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseKind = Exercise["kind"];
export type Correctness = "correct" | "partial" | "incorrect" | "ungraded";
export type Rating = 1 | 2 | 3 | 4;
export type ExerciseAttempt = {
    id: string;
    exerciseId: string;
    exerciseVersion: number;
    startedAt: string;
    finishedAt: string;
    submittedMovesUci: string[];
    submittedAnswerIds: string[];
    selfExplanation: string;
    hintsUsed: number;
    elapsedMs: number;
    correctness: Correctness;
    feedback: string;
    errors: number;
    selfAssessment?: "correct" | "partial" | "incorrect";
    moveSubmissions?: { uci: string; at: string; fen: string; legal: boolean; accepted: boolean }[];
};
export type StoredFsrsCard = {
    due: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    last_review?: string;
};
export type SrsExerciseCard = {
    id: string;
    exerciseId: string;
    activeExerciseVersion: number;
    fsrsCard: StoredFsrsCard;
    dueAt: string;
    suspended: boolean;
    needsReconciliation: boolean;
};
export type ReviewEvent = {
    id: string;
    cardId: string;
    attemptId: string;
    reviewedAt: string;
    rating: Rating;
    fsrsLog: Record<string, unknown>;
    schedulerVersion: string;
};
export type SourceAnchor = {
    id: string;
    sourceKey: string;
    label: string;
    page?: number;
    excerpt?: string;
    fingerprint?: string;
};
export const isMoveExercise = (exercise: Exercise) =>
    ["tactic-sequence", "find-move", "endgame-technique"].includes(exercise.kind);

export function answerSignature(exercise: Exercise) {
    return JSON.stringify({
        kind: exercise.kind,
        fen: exercise.startFen,
        lines: exercise.acceptedLinesUci,
        answers: exercise.acceptedAnswerIds,
        rubric: exercise.rubric,
        goal: exercise.goal,
    });
}
export async function stableId(value: string) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
