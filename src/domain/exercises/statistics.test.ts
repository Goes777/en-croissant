// @vitest-environment node
import { expect, it } from "vitest";
import { introductoryExercises } from "./seeds";
import { observedStatistics } from "./statistics";
import type { ExerciseAttempt } from "./model";

it("separa respostas abertas e usa só a primeira tentativa diária nas tendências", () => {
    const exercise = introductoryExercises[0];
    const attempt: ExerciseAttempt = {
        id: "1",
        exerciseId: exercise.id,
        exerciseVersion: 1,
        startedAt: "2026-10-30T10:00:00Z",
        finishedAt: "2026-10-30T10:00:05Z",
        submittedMovesUci: [],
        submittedAnswerIds: [],
        selfExplanation: "",
        hintsUsed: 0,
        elapsedMs: 5000,
        correctness: "incorrect",
        feedback: "",
        errors: 1,
    };
    const stats = observedStatistics(
        [exercise],
        [
            attempt,
            {
                ...attempt,
                id: "2",
                finishedAt: "2026-10-30T11:00:00Z",
                correctness: "correct",
                errors: 0,
            },
        ],
        new Date("2026-10-30T12:00:00Z"),
    );
    expect(stats.recent).toEqual({ attempts: 1, independentRate: 0 });
    expect(stats.distinctPositions).toBe(1);
    expect(stats.themes[0].automatic).toBe(2);
    expect(
        observedStatistics(
            [exercise],
            [{ ...attempt, correctness: "ungraded" }],
            new Date("2026-10-30T12:00:00Z"),
        ).recent.independentRate,
    ).toBeNull();
});
