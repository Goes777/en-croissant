import type { Page } from "@playwright/test";
import type {
    ExerciseAttempt,
    ReviewEvent,
    SrsExerciseCard,
} from "../../src/domain/exercises/model";

export async function sessionUserId(page: Page) {
    const response = await page.request.get("/api/auth/get-session?disableCookieCache=true");
    if (!response.ok()) throw new Error("Não foi possível verificar a sessão do teste.");
    const session = await response.json();
    if (!session?.user?.id) throw new Error("O teste esperava uma conta autenticada.");
    return session.user.id as string;
}

/** Read the real browser database selected by the authenticated, stable user id. */
export async function readProgress(page: Page, userId?: string) {
    return page.evaluate(async (id) => {
        const hash = id
            ? Array.from(
                  new Uint8Array(
                      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id)),
                  ),
                  (byte) => byte.toString(16).padStart(2, "0"),
              ).join("")
            : null;
        const name = hash ? "ChessPraticaProfile-" + hash : "ChessPraticaTraining";
        if (!(await indexedDB.databases()).some((database) => database.name === name))
            throw new Error("Banco do perfil ausente: " + name);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            const tx = db.transaction(["attempts", "events", "cards"], "readonly");
            const attempts = tx.objectStore("attempts").getAll();
            const events = tx.objectStore("events").getAll();
            const cards = tx.objectStore("cards").getAll();
            // Resolve at completion, not at the success of an individual request.
            await new Promise<void>((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error);
            });
            return {
                name,
                attempts: attempts.result as ExerciseAttempt[],
                events: events.result as ReviewEvent[],
                cards: cards.result as SrsExerciseCard[],
            };
        } finally {
            db.close();
        }
    }, userId);
}

type ReviewGateWindow = typeof window & {
    reviewCommitGate: { armed: boolean; pending: boolean; release?: () => void };
};

/** Install before navigation: Dexie binds the native transaction function when
 * opening the database. Read requests hold the armed transaction without timers.
 */
export async function holdReviewCommit(page: Page) {
    await page.addInitScript(() => {
        const gate = {
            armed: false,
            pending: false,
            release: undefined as (() => void) | undefined,
        };
        (window as ReviewGateWindow).reviewCommitGate = gate;
        const original = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
            const tx = original.apply(this, args);
            if (gate.armed && tx.mode === "readwrite" && tx.objectStoreNames.contains("attempts")) {
                gate.armed = false;
                gate.pending = true;
                const commit = tx.commit.bind(tx);
                let requested = false;
                // Cover both Dexie's explicit commit and IndexedDB's auto-commit.
                tx.commit = () => {
                    if (gate.pending) requested = true;
                    else commit();
                };
                gate.release = () => {
                    gate.pending = false;
                    if (requested) commit();
                };
                const keepAlive = () => {
                    if (gate.pending) tx.objectStore("attempts").count().onsuccess = keepAlive;
                };
                keepAlive();
            }
            return tx;
        };
    });
    return {
        arm: () =>
            page.evaluate(() => {
                (window as ReviewGateWindow).reviewCommitGate.armed = true;
            }),
        pending: () =>
            page.waitForFunction(() => (window as ReviewGateWindow).reviewCommitGate.pending),
        release: () =>
            page.evaluate(() => {
                (window as ReviewGateWindow).reviewCommitGate.release?.();
            }),
    };
}
