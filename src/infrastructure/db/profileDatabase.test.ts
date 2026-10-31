// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import {
    TrainingDatabase,
    exportBackup,
    reconcileExercises,
    recordReview,
} from "./TrainingDatabase";
import { introductoryExercises } from "@/domain/exercises/seeds";
import { profileDatabase, copyLegacyProgress } from "./profileDatabase";

it("separa os dados de perfis e reabre o mesmo perfil sem misturar registros", async () => {
    const a = await profileDatabase("teste-" + crypto.randomUUID());
    const b = await profileDatabase("teste-" + crypto.randomUUID());
    const sameName = a.name;
    try {
        await a.settings.put({ key: "perfil", value: "pessoa A" });
        expect(await b.settings.get("perfil")).toBeUndefined();
        a.close();
        const reopened = new TrainingDatabase(sameName);
        try {
            expect((await reopened.settings.get("perfil"))?.value).toBe("pessoa A");
        } finally {
            reopened.close();
        }
    } finally {
        a.close();
        b.close();
        await Dexie.delete(a.name);
        await Dexie.delete(b.name);
    }
});

it("copia o percurso legado sem apagar a origem ou expor dados a outro perfil", async () => {
    const legacy = new TrainingDatabase(),
        a = await profileDatabase(crypto.randomUUID()),
        b = await profileDatabase(crypto.randomUUID());
    try {
        const exercise = { ...introductoryExercises[0], sourceAnchorIds: [] },
            now = new Date("2026-10-31T12:00:00Z");
        await reconcileExercises(legacy, [exercise], [], now);
        await recordReview(
            legacy,
            {
                id: crypto.randomUUID(),
                exerciseId: exercise.id,
                exerciseVersion: 1,
                startedAt: now.toISOString(),
                finishedAt: new Date(now.getTime() + 1000).toISOString(),
                submittedMovesUci: exercise.acceptedLinesUci[0],
                submittedAnswerIds: [],
                selfExplanation: "",
                hintsUsed: 0,
                elapsedMs: 1000,
                errors: 0,
            },
            3,
            0,
        );
        const before = await exportBackup(legacy);
        await copyLegacyProgress(a);
        await copyLegacyProgress(a);
        expect(await a.events.count()).toBe(1);
        expect(await a.cards.toArray()).toEqual(before.cards);
        expect(await b.cards.count()).toBe(0);
        expect(await b.events.count()).toBe(0);
        expect(await exportBackup(legacy)).toMatchObject({
            events: before.events,
            cards: before.cards,
            attempts: before.attempts,
        });
    } finally {
        legacy.close();
        a.close();
        b.close();
        for (const name of [legacy.name, a.name, b.name]) await Dexie.delete(name);
    }
});
