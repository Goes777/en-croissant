import { useEffect, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key } from "@lichess-org/chessground/types";
import { chessgroundDests } from "chessops/compat";
import { parseSquare } from "chessops";
import { positionFromExercise } from "@/domain/exercises/grader";
import { syncBoardBounds } from "@/chessground/syncBoardBounds";

export function TrainingBoard({
  fen,
  orientation = "white",
  interactive = false,
  onMove,
  selectedMove,
  theme = "classic",
}: {
  fen: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  onMove?: (uci: string) => void;
  selectedMove?: string;
  theme?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    api = useRef<Api | null>(null),
    callback = useRef(onMove);
  useEffect(() => {
    callback.current = onMove;
  }, [onMove]);
  useEffect(() => {
    if (!root.current) return;
    api.current = Chessground(root.current, {
      coordinates: true,
      animation: { enabled: true, duration: 150 },
      drawable: { enabled: true },
      movable: { free: false },
      events: {},
    });
    const cleanup = syncBoardBounds(root.current, api.current);
    return () => {
      cleanup();
      api.current?.destroy();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    const position = positionFromExercise(fen);
    api.current?.set({
      fen,
      orientation,
      turnColor: position.turn,
      check: position.isCheck() ? position.turn : false,
      movable: {
        color: interactive ? position.turn : undefined,
        free: false,
        dests: interactive ? chessgroundDests(position) : new Map(),
        events: {
          after: (from, to) => {
            const role = position.board.get(parseSquare(from)!);
            const promotion =
              role?.role === "pawn" && (to[1] === "8" || to[1] === "1")
                ? window
                    .prompt("Promover para: q (dama), r (torre), b (bispo) ou n (cavalo)", "q")
                    ?.toLowerCase()
                : "";
            callback.current?.(
              from +
                to +
                (["q", "r", "b", "n"].includes(promotion ?? "")
                  ? promotion
                  : role?.role === "pawn" && (to[1] === "8" || to[1] === "1")
                    ? "q"
                    : ""),
            );
            api.current?.set({ fen });
          },
        },
      },
      lastMove: selectedMove
        ? ([selectedMove.slice(0, 2), selectedMove.slice(2, 4)] as [Key, Key])
        : undefined,
      draggable: { enabled: interactive },
      selectable: { enabled: interactive },
    });
  }, [fen, orientation, interactive, selectedMove]);
  return (
    <div
      className={`training-board board-${theme}`}
      data-testid="chessboard"
      aria-label={`Tabuleiro: ${positionFromExercise(fen).turn === "white" ? "brancas" : "pretas"} a jogar`}
    >
      <div ref={root} className="cg-wrap" />
    </div>
  );
}
