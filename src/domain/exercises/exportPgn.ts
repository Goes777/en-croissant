import {
    ChildNode,
    defaultGame,
    makePgn,
    parsePgn,
    startingPosition,
    type PgnNodeData,
} from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";
import { makeUci, parseUci } from "chessops";
import { normalizeMove } from "chessops/chess";
import { makeFen } from "chessops/fen";
import type { Exercise } from "./model";
import { positionFromExercise, validateExercise } from "./grader";

/** Keep the original annotated tree whenever it still matches the edited solution. */
export function coursePgn(exercises: Exercise[]) {
    return exercises
        .map((input) => {
            const exercise = validateExercise(input);
            const original = exercise.sourcePgn ? parsePgn(exercise.sourcePgn)[0] : undefined;
            if (
                original &&
                makeFen(startingPosition(original.headers).unwrap().toSetup()) === exercise.startFen
            ) {
                const lines: string[][] = [];
                const visit = (
                    node: typeof original.moves,
                    position: ReturnType<typeof positionFromExercise>,
                    played: string[],
                ) => {
                    if (!node.children.length && played.length) lines.push(played);
                    for (const child of node.children) {
                        const next = position.clone(),
                            move = parseSan(next, child.data.san);
                        if (!move) return;
                        const uci = makeUci(normalizeMove(next, move));
                        next.play(move);
                        visit(child, next, [...played, uci]);
                    }
                };
                visit(original.moves, positionFromExercise(exercise.startFen), []);
                if (
                    JSON.stringify(lines) === JSON.stringify(exercise.acceptedLinesUci) ||
                    !exercise.acceptedLinesUci.length
                )
                    return makePgn(original);
            }
            const game = defaultGame<PgnNodeData>();
            game.headers.set("Event", exercise.title);
            game.headers.set("SetUp", "1");
            game.headers.set("FEN", exercise.startFen);
            game.headers.set("Topic", exercise.tags.join(" / "));
            game.headers.set("Result", "*");
            game.comments = [
                exercise.prompt,
                exercise.explanation,
                ...exercise.rubric.map((item) => `${item.criterion}: ${item.explanation}`),
            ];
            for (const line of exercise.acceptedLinesUci) {
                let node = game.moves;
                const position = positionFromExercise(exercise.startFen);
                for (const uci of line) {
                    const move = parseUci(uci)!;
                    const san = makeSanAndPlay(position, move);
                    let child = node.children.find((item) => item.data.san === san);
                    if (!child) {
                        child = new ChildNode({ san });
                        node.children.push(child);
                    }
                    node = child;
                }
            }
            return makePgn(game);
        })
        .join("\n");
}
