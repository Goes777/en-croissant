// @vitest-environment node
import { describe, expect, it } from "vitest";
import { proposePgnExercises } from "./pgn";

describe("importação autoral de exercícios", () => {
    const pgn =
        '[Event "Duas ideias"]\n\n{Introdução.} 1. e4 e5 2. Nf3 (2. Bc4 {Comentário da variante.}) *';
    it("preserva comentários/variantes e usa IDs estáveis na reimportação", async () => {
        const first = await proposePgnExercises(pgn, "curso:fonte", "Curso");
        const again = await proposePgnExercises(pgn, "curso:fonte", "Curso");
        expect(first.exercises[0].id).toBe(again.exercises[0].id);
        expect(first.exercises[0].acceptedLinesUci).toHaveLength(2);
        expect(first.exercises[0].sourcePgn).toContain("Comentário da variante.");
        expect(first.originalText).toBe(pgn);
        expect(first.exercises[0].status).toBe("needs-review");
    });
    it("separa linhas ilegais e não aceita tokens que o parser descartaria", async () => {
        const invalid = await proposePgnExercises("1. e4 e4 *", "bad", "Curso");
        expect(invalid.exercises).toHaveLength(0);
        expect(invalid.issues).toHaveLength(1);
        await expect(proposePgnExercises("1. e4 ???lixo *", "bad", "Curso")).rejects.toThrow(/./);
    });
});
