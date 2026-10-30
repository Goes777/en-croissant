import { parseUci } from "chessops";
import { makeSanAndPlay } from "chessops/san";
import { positionFromExercise } from "./grader";

export function lineInSan(fen: string, line: string[]) {
    const position = positionFromExercise(fen),
        parts: string[] = [];
    for (const [index, uci] of line.entries()) {
        const move = parseUci(uci);
        if (!move || !position.isLegal(move)) throw new Error("Linha inválida.");
        const number =
            position.turn === "white"
                ? `${position.fullmoves}. `
                : index === 0
                  ? `${position.fullmoves}... `
                  : "";
        parts.push(number + makeSanAndPlay(position, move));
    }
    return parts.join(" ");
}
