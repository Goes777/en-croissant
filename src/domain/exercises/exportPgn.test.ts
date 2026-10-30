// @vitest-environment node
import { expect, it } from "vitest";
import { introductoryExercises } from "./seeds";
import { proposePgnExercises } from "./pgn";
import { coursePgn } from "./exportPgn";

it("reexporta comentários e variantes e mantém soluções editadas legais", async () => {
    const proposal = await proposePgnExercises(
        '[Event "Exemplo"]\n\n{Ideia original} 1. e4 e5 2. Nf3 (2. Bc4 {Plano alternativo}) *',
        "teste",
        "Curso",
    );
    const pgn = coursePgn(proposal.exercises);
    expect(pgn).toContain("Ideia original");
    expect(pgn).toContain("Plano alternativo");
    const again = await proposePgnExercises(pgn, "exportado", "Curso");
    expect(again.exercises[0].acceptedLinesUci).toEqual(proposal.exercises[0].acceptedLinesUci);
    const sample = await proposePgnExercises(
        coursePgn([introductoryExercises[0]]),
        "autoria",
        "Curso",
    );
    expect(sample.issues).toEqual([]);
    expect(sample.exercises[0].acceptedLinesUci).toEqual(introductoryExercises[0].acceptedLinesUci);
});
