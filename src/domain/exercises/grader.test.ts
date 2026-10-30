// @vitest-environment node
import { describe, expect, it } from "vitest";
import { INITIAL_FEN } from "chessops/fen";
import {
    gradeAttempt,
    playTrainingMove,
    positionFromExercise,
    suggestedRating,
    validateExercise,
} from "./grader";
import { introductoryExercises } from "./seeds";

const line = () =>
    validateExercise({
        ...introductoryExercises[0],
        id: "line",
        goal: "line",
        startFen: INITIAL_FEN,
        acceptedLinesUci: [
            ["e2e4", "e7e5", "g1f3"],
            ["d2d4", "d7d5", "c2c4"],
        ],
    });
describe("correção pedagógica independente do FSRS", () => {
    it("oferece dez exercícios táticos e dez estratégicos com posições distintas", () => {
        expect(introductoryExercises).toHaveLength(20);
        expect(introductoryExercises.filter((x) => x.acceptedLinesUci.length)).toHaveLength(10);
        expect(new Set(introductoryExercises.map((x) => x.startFen)).size).toBeGreaterThanOrEqual(
            18,
        );
        for (const exercise of introductoryExercises)
            expect(() => validateExercise(exercise)).not.toThrow();
    });
    it("aceita apenas linhas aprovadas e exige a sequência completa", () => {
        const exercise = line();
        const first = playTrainingMove(exercise, [], "e2e4");
        expect(first.played).toEqual(["e2e4", "e7e5"]);
        expect(first.complete).toBe(false);
        expect(gradeAttempt(exercise, { moves: first.played }).correctness).toBe("partial");
        const last = playTrainingMove(exercise, first.played, "g1f3");
        expect(last.complete).toBe(true);
        expect(gradeAttempt(exercise, { moves: last.played }).correctness).toBe("correct");
        expect(playTrainingMove(exercise, [], "c2c4")).toMatchObject({
            accepted: false,
            legal: true,
            played: [],
        });
        expect(playTrainingMove(exercise, [], "e2e5")).toMatchObject({
            accepted: false,
            legal: false,
            played: [],
        });
        expect(playTrainingMove(exercise, [], "d2d4").accepted).toBe(true);
    });
    it("não declara mate quando o gabarito não termina em mate", () => {
        expect(() => validateExercise({ ...line(), goal: "checkmate" })).toThrow(/mate/);
    });
    it("trata roque, en passant e subpromoção no contexto da posição", () => {
        const castle = validateExercise({
            ...line(),
            startFen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
            acceptedLinesUci: [["e1g1"]],
        });
        expect(playTrainingMove(castle, [], "e1g1").complete).toBe(true);
        const ep = validateExercise({
            ...line(),
            startFen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2",
            acceptedLinesUci: [["e5d6"]],
        });
        expect(playTrainingMove(ep, [], "e5d6").complete).toBe(true);
        const promotion = introductoryExercises.find((x) => x.id.endsWith(":t10"))!;
        const result = playTrainingMove(promotion, [], "c7c8r");
        expect(result.complete).toBe(true);
        expect(positionFromExercise(result.fen).isStalemate()).toBe(false);
        expect(playTrainingMove(promotion, [], "c7c8q").accepted).toBe(false);
    });
    it("aceita mais de um plano justificado e distingue respostas parciais", () => {
        const exercise = introductoryExercises.find((x) => x.id.endsWith(":s1"))!;
        expect(gradeAttempt(exercise, { answers: ["center", "develop"] }).correctness).toBe(
            "correct",
        );
        expect(gradeAttempt(exercise, { answers: ["develop"] }).correctness).toBe("partial");
        expect(gradeAttempt(exercise, { answers: ["queen"] }).correctness).toBe("incorrect");
    });
    it("mantém respostas conceituais não classificáveis, mesmo com palavras do gabarito", () => {
        const exercise = introductoryExercises.find((x) => x.kind === "strategy-explain")!;
        expect(gradeAttempt(exercise, { explanation: exercise.explanation }).correctness).toBe(
            "ungraded",
        );
    });
    it("não sugere Fácil por tempo e leva ajuda/erros em conta", () => {
        expect(suggestedRating("correct", 0, 0)).toBe(3);
        expect(suggestedRating("correct", 1, 0)).toBe(2);
        expect(suggestedRating("correct", 0, 1)).toBe(1);
        expect(suggestedRating("incorrect", 0, 0)).toBe(1);
        expect(suggestedRating("ungraded", 0, 0, "partial")).toBe(1);
    });
});
