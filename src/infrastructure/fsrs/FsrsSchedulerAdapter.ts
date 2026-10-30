import {
    type Card,
    createEmptyCard,
    fsrs,
    generatorParameters,
    type Grade,
    type ReviewLog,
} from "ts-fsrs";
import { z } from "zod";
import { type Rating, type StoredFsrsCard } from "@/domain/exercises/model";

export const SCHEDULER_VERSION = "ts-fsrs@3.5.1";
const iso = z.string().datetime();
export const storedFsrsCardSchema = z.object({
    due: iso,
    stability: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
    elapsed_days: z.number().nonnegative(),
    scheduled_days: z.number().nonnegative(),
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    state: z.number().int().min(0).max(3),
    last_review: iso.optional(),
});
const date = (value: Date | string) => {
    const result = new Date(value);
    if (!Number.isFinite(result.getTime())) throw new Error("Data de revisão inválida.");
    return result;
};
export function encodeCard(card: Card): StoredFsrsCard {
    return storedFsrsCardSchema.parse({
        ...card,
        due: date(card.due).toISOString(),
        last_review: card.last_review ? date(card.last_review).toISOString() : undefined,
    });
}
export function decodeCard(input: StoredFsrsCard): Card {
    const card = storedFsrsCardSchema.parse(input);
    return {
        ...card,
        due: date(card.due),
        last_review: card.last_review ? date(card.last_review) : undefined,
    };
}
export function decodeLog(input: Record<string, unknown>): ReviewLog {
    const parsed = z
        .object({
            rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
            state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
            due: iso,
            review: iso,
            stability: z.number(),
            difficulty: z.number(),
            elapsed_days: z.number(),
            last_elapsed_days: z.number(),
            scheduled_days: z.number(),
        })
        .parse(input);
    return { ...parsed, due: date(parsed.due), review: date(parsed.review) };
}
export class FsrsSchedulerAdapter {
    readonly version = SCHEDULER_VERSION;
    private readonly scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
    create(now: Date): StoredFsrsCard {
        return encodeCard(createEmptyCard(date(now)));
    }
    review(input: StoredFsrsCard, now: Date, rating: Rating) {
        if (![1, 2, 3, 4].includes(rating)) throw new Error("Avaliação FSRS inválida.");
        const card = decodeCard(input);
        if (card.last_review && date(now) < card.last_review)
            throw new Error("A revisão não pode preceder a última revisão.");
        // The pinned 3.5.1 API is repeat(card, now)[rating], not next(...).
        const result = this.scheduler.repeat(card, date(now))[rating as Grade];
        return {
            card: encodeCard(result.card),
            log: JSON.parse(JSON.stringify(result.log)) as Record<string, unknown>,
            schedulerVersion: this.version,
        };
    }
    preview(input: StoredFsrsCard, now: Date) {
        return ([1, 2, 3, 4] as const).map((rating) => ({
            rating,
            dueAt: this.review(input, now, rating).card.due,
        }));
    }
}
export const fsrsScheduler = new FsrsSchedulerAdapter();
