// @vitest-environment node
import { expect, it } from "vitest";
import { fsrsScheduler } from "@/infrastructure/fsrs/FsrsSchedulerAdapter";
import { proposeDesktopMigration } from "./legacyMigration";

it("preserva agenda e logs antigos sem inventar tentativas ou tempos", async () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const scheduled = fsrsScheduler.review(fsrsScheduler.create(now), now, 3);
    const log = { ...scheduled.log, fen: "8/7k/8/8/8/8/7K/8 w - - 0 1" };
    const input = {
        format: "chesspratica-migration",
        version: 1,
        courses: [],
        decks: [
            {
                key: "deck-curso-0",
                data: {
                    positions: [{ fen: log.fen, answer: "Kg3", card: scheduled.card }],
                    logs: [log],
                },
            },
        ],
    };
    const proposal = await proposeDesktopMigration(input),
        again = await proposeDesktopMigration(input);
    expect(proposal.legacyCards![0].fsrsCard).toEqual(scheduled.card);
    expect(proposal.legacyCards![0].id).toBe(again.legacyCards![0].id);
    expect(proposal.migrationSettings![0].value).toEqual(log);
    expect(proposal.exercises[0].acceptedLinesUci).toEqual([["h2g3"]]);
    expect(proposal).not.toHaveProperty("attempts");
});
