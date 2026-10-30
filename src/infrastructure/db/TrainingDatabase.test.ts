// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { introductoryExercises } from "@/domain/exercises/seeds";
import { fsrsScheduler } from "@/infrastructure/fsrs/FsrsSchedulerAdapter";
import {
    TrainingDatabase,
    TRAINING_SCHEMA_V1,
    confirmReconciliation,
    exportBackup,
    reconcileExercises,
    recordReview,
    restoreBackup,
} from "./TrainingDatabase";

const dbs: TrainingDatabase[] = [];
function database(name = "ChessPratica-test-" + crypto.randomUUID()) {
    const db = new TrainingDatabase(name);
    dbs.push(db);
    return db;
}
const exercise = introductoryExercises[0],
    anchors = exercise.sourceAnchorIds.map((id) => ({
        id,
        sourceKey: "test",
        label: "Autor do teste",
    })),
    now = new Date("2026-10-30T12:00:00Z");
const attempt = (id = crypto.randomUUID()) => ({
    id,
    exerciseId: exercise.id,
    exerciseVersion: 1,
    startedAt: now.toISOString(),
    finishedAt: new Date(now.getTime() + 10_000).toISOString(),
    submittedMovesUci: exercise.acceptedLinesUci[0],
    submittedAnswerIds: [],
    selfExplanation: "",
    hintsUsed: 0,
    elapsedMs: 10_000,
    errors: 0,
});
afterEach(async () => {
    const all = dbs.splice(0);
    for (const db of all) db.close();
    for (const name of new Set(all.map((db) => db.name))) await Dexie.delete(name);
});
describe("banco offline e histórico", () => {
    it("grava tentativa + cartão + evento juntos e mantém tudo após reabrir", async () => {
        let db = database();
        await reconcileExercises(db, [exercise], anchors, now);
        await recordReview(db, attempt(), 3, 0);
        const saved = (await db.cards.toArray())[0];
        expect(saved.fsrsCard.reps).toBe(1);
        expect(await db.events.count()).toBe(1);
        expect(await db.attempts.count()).toBe(1);
        const name = db.name;
        db.close();
        db = database(name);
        expect((await db.cards.toArray())[0]).toEqual(saved);
        expect(await db.events.count()).toBe(1);
    });
    it("recusa envio duplicado ou concorrente sem gerar dois eventos", async () => {
        const db = database();
        await reconcileExercises(db, [exercise], anchors, now);
        const results = await Promise.allSettled([
            recordReview(db, attempt(), 3, 0),
            recordReview(db, attempt(), 3, 0),
        ]);
        expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(await db.events.count()).toBe(1);
        expect(await db.attempts.count()).toBe(1);
    });
    it("reimporta sem duplicar cartões e preserva histórico se o gabarito mudar", async () => {
        const db = database();
        await reconcileExercises(db, [exercise], anchors, now);
        await recordReview(db, attempt(), 3, 0);
        await reconcileExercises(db, [exercise], anchors, now);
        expect(await db.cards.count()).toBe(1);
        const changed = { ...exercise, goal: "line" as const, acceptedLinesUci: [["h5f3"]] };
        await reconcileExercises(db, [changed], anchors, now);
        expect((await db.cards.toArray())[0]).toMatchObject({
            suspended: true,
            needsReconciliation: true,
        });
        expect(await db.events.count()).toBe(1);
        await confirmReconciliation(db, exercise.id);
        expect((await db.cards.toArray())[0].fsrsCard.reps).toBe(0);
        expect(await db.events.count()).toBe(1);
        expect(await db.exerciseVersions.count()).toBe(2);
    });
    it("faz backup/restauração e recusa sobrescrever eventos históricos", async () => {
        const db = database();
        await reconcileExercises(db, [exercise], anchors, now);
        await recordReview(db, attempt(), 3, 0);
        const backup = await exportBackup(db),
            restored = database();
        await restoreBackup(restored, JSON.parse(JSON.stringify(backup)));
        expect(await exportBackup(restored)).toMatchObject({
            cards: backup.cards,
            events: backup.events,
            attempts: backup.attempts,
        });
        await restoreBackup(restored, backup);
        expect(await restored.events.count()).toBe(1);
        const bad = structuredClone(backup);
        bad.events[0].rating = 4;
        await expect(restoreBackup(restored, bad)).rejects.toThrow(/Conflito/);
        expect((await restored.events.toArray())[0].rating).toBe(3);
    });
    it("migra a primeira estrutura Dexie sem perder cartões ou revisões", async () => {
        const name = "ChessPratica-test-" + crypto.randomUUID(),
            old = new Dexie(name);
        old.version(1).stores(TRAINING_SCHEMA_V1);
        await old.table("exercises").put(exercise);
        const fsrsCard = fsrsScheduler.create(now);
        await old.table("cards").put({
            id: "card:" + exercise.id,
            exerciseId: exercise.id,
            fsrsCard,
            dueAt: fsrsCard.due,
            suspended: false,
        });
        await old.table("events").put({
            id: "legacy",
            cardId: "card:" + exercise.id,
            attemptId: "legacy-attempt",
            reviewedAt: now.toISOString(),
            rating: 3,
            fsrsLog: {},
            schedulerVersion: "ts-fsrs@3.5.1",
        });
        old.close();
        const upgraded = database(name);
        await upgraded.open();
        expect(await upgraded.exercises.count()).toBe(1);
        expect(await upgraded.events.count()).toBe(1);
        expect((await upgraded.cards.toArray())[0]).toMatchObject({
            needsReconciliation: false,
            activeExerciseVersion: 1,
        });
        expect(await upgraded.exerciseVersions.count()).toBe(1);
    });
});
