// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsrsScheduler, decodeCard, SCHEDULER_VERSION } from "./FsrsSchedulerAdapter";

describe("adaptador da versão fixa ts-fsrs 3.5.1", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    it("usa os quatro ratings oficiais sem mutar o cartão recebido", () => {
        const card = fsrsScheduler.create(now),
            original = JSON.stringify(card);
        for (const rating of [1, 2, 3, 4] as const) {
            const next = fsrsScheduler.review(card, now, rating);
            expect(next.card.reps).toBe(1);
            expect(next.log.rating).toBe(rating);
            expect(next.schedulerVersion).toBe(SCHEDULER_VERSION);
        }
        expect(JSON.stringify(card)).toBe(original);
    });
    it("continua o agendamento após serialização JSON e reabertura", () => {
        const first = fsrsScheduler.review(fsrsScheduler.create(now), now, 3);
        const reopened = JSON.parse(JSON.stringify(first.card));
        expect(decodeCard(reopened).due).toBeInstanceOf(Date);
        const next = fsrsScheduler.review(reopened, new Date(first.card.due), 3);
        expect(next.card.reps).toBe(2);
        expect(new Date(next.card.due).getTime()).toBeGreaterThan(
            new Date(first.card.due).getTime(),
        );
    });
    it("recusa cartão corrompido, data anterior e rating fora da escala", () => {
        const card = fsrsScheduler.create(now);
        expect(() => decodeCard({ ...card, due: "inválida" })).toThrow(/./);
        expect(() => fsrsScheduler.review(card, now, 0 as 1)).toThrow(/./);
        const reviewed = fsrsScheduler.review(card, now, 3).card;
        expect(() => fsrsScheduler.review(reviewed, new Date("2020-01-01"), 3)).toThrow(/./);
    });
});
