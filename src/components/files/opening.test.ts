// @vitest-environment node
import { createEmptyCard } from "ts-fsrs";
import { expect, it } from "vitest";
import type { PracticeData } from "@/state/atoms";
import { getNextReviewTimes, updateCardPerformance } from "./opening";

it("mantém os cartões e logs do repertório compatíveis com o adaptador compartilhado", () => {
    const card = createEmptyCard(new Date()),
        before = JSON.stringify(card);
    const due = getNextReviewTimes(card);
    expect(Object.keys(due)).toHaveLength(4);
    for (const value of Object.values(due)) expect(value).toBeInstanceOf(Date);
    expect(JSON.stringify(card)).toBe(before);
    let data: PracticeData = { positions: [{ fen: "exemplo", answer: "e4", card }], logs: [] };
    updateCardPerformance(
        (update) => {
            data = typeof update === "function" ? update(data) : update;
        },
        0,
        card,
        3,
    );
    expect(data.positions[0].card.reps).toBe(1);
    expect(data.logs[0].fen).toBe("exemplo");
    expect(data.logs[0].review).toBeInstanceOf(Date);
});
