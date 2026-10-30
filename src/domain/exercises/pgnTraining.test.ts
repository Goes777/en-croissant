// @vitest-environment node
import { expect, it } from "vitest";
import { proposePgnExercises } from "./pgn";
import { coursePgn } from "./exportPgn";
import { playTrainingMove } from "./grader";
import { inspectCourseGame } from "@/components/courses/model";

const headers =
    '[Event "Autoria de teste"]\n[White "Exercício 1"]\n[SourceRecord "4"]\n[Stage "1"]\n[SetUp "1"]\n';
it("usa objetivo, tema, etapa e identidade estável entre organizações do mesmo curso", async () => {
    const pgn =
        headers +
        '[TrainingType "Mate em 1 / Mate com torre"]\n[FEN "4k3/8/4K3/8/8/8/R7/8 w - - 0 1"]\n\n1. Ra8# (1. Ra1 $2) *';
    const first = await proposePgnExercises(pgn, "coleção completa", "Curso"),
        second = await proposePgnExercises(pgn, "tema separado", "Curso");
    expect(first.issues).toEqual([]);
    expect(first.exercises[0].id).toBe(second.exercises[0].id);
    expect(first.exercises[0]).toMatchObject({
        stage: "1",
        trainingType: "Mate em 1 / Mate com torre",
        goal: "checkmate",
        exerciseNumber: 1,
        acceptedLinesUci: [["a2a8"]],
    });
    expect(first.exercises[0].prompt).toContain("mate em 1");
    expect(first.exercises[0].sourcePgn).toContain("$2");
    expect(coursePgn(first.exercises)).toContain("$2");
    expect(playTrainingMove(first.exercises[0], [], "a2a1").accepted).toBe(false);
});
it("preserva o marcador terminal sem transformá-lo em um lance ou descartar a posição", async () => {
    const pgn =
        headers +
        '[TrainingType "Ganho de peça / Ganhar uma torre"]\n[FEN "4k3/r7/8/8/8/8/8/R3K3 w - - 0 1"]\n\n1. Rxa7 -- *';
    expect(() => inspectCourseGame(pgn)).toThrow(/illegalMove/);
    const proposal = await proposePgnExercises(pgn, "arquivo", "Curso");
    expect(proposal.issues).toEqual([]);
    const exercise = proposal.exercises[0];
    expect(exercise.acceptedLinesUci).toEqual([["a1a7"]]);
    expect(playTrainingMove(exercise, [], "a1a7").complete).toBe(true);
    expect(coursePgn([exercise])).toContain("--");
    const broken = await proposePgnExercises(
        pgn.replace("Rxa7 --", "Rxa7 -- Ra8"),
        "arquivo",
        "Curso",
    );
    expect(broken.exercises).toHaveLength(0);
});
it("conserva os diagramas didáticos separados e não inventa solução de treino", async () => {
    const pgn =
        '[Event "Autoria de teste"]\n[White "Example 1"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n{Texto didático. [%cal Ge1e8]} 1. -- *';
    const proposal = await proposePgnExercises(pgn, "exemplos", "Curso");
    expect(proposal.issues).toEqual([]);
    expect(proposal.exercises[0]).toMatchObject({ lessonRole: "example", acceptedLinesUci: [] });
    expect(proposal.exercises[0].explanation).toBe("Texto didático.");
    expect(proposal.exercises[0].sourcePgn).toContain("[%cal");
});
