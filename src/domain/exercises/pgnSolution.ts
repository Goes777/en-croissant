import type { Game, Node, PgnNodeData } from "chessops/pgn";
import { startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import { makeUci } from "chessops";
import { normalizeMove, type Position } from "chessops/chess";

/** Training answers omit refutations and terminal diagram markers; the source tree stays intact. */
export function solutionLines(game: Game<PgnNodeData>, mate = false) {
    const initial = startingPosition(game.headers).unwrap(),
        lines: string[][] = [];
    let terminalMarkers = 0,
        refutations = 0;
    const stack: { node: Node<PgnNodeData>; position: Position; moves: string[] }[] = [
        { node: game.moves, position: initial, moves: [] },
    ];
    const add = (moves: string[], position: Position) => {
        if (
            moves.length &&
            (!mate || (position.isCheckmate() && position.outcome()?.winner === initial.turn))
        )
            lines.push(moves);
    };
    while (stack.length) {
        const item = stack.pop()!;
        if (!item.node.children.length) add(item.moves, item.position);
        for (const child of [...item.node.children].reverse()) {
            if (child.data.san === "--") {
                if (child.children.length)
                    throw new Error(
                        "Um marcador didático no meio de uma linha precisa de revisão manual.",
                    );
                terminalMarkers++;
                add(item.moves, item.position);
                continue;
            }
            if (child.data.nags?.some((nag) => [2, 4, 6].includes(nag))) {
                refutations++;
                continue;
            }
            const next = item.position.clone(),
                move = parseSan(next, child.data.san);
            if (!move || !next.isLegal(move))
                throw new Error("Lance ilegal no PGN: " + child.data.san);
            const uci = makeUci(normalizeMove(next, move));
            next.play(move);
            stack.push({ node: child, position: next, moves: [...item.moves, uci] });
        }
        if (lines.length + stack.length > 1000)
            throw new Error("Excesso de variantes; divida o capítulo.");
    }
    return {
        lines: [...new Map(lines.map((line) => [line.join(" "), line])).values()],
        terminalMarkers,
        refutations,
    };
}
