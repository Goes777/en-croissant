/// <reference types="node" />
// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredCourse } from "./model";

const state = vi.hoisted(() => ({
    games: [] as string[],
    failRename: false,
}));

vi.mock("@/bindings", () => ({
    commands: {
        countPgnGames: async () => ({ status: "ok", data: state.games.length }),
        readGames: async (_path: string, start: number, end: number) => ({
            status: "ok",
            data: state.games.slice(start, end + 1),
        }),
    },
}));

vi.mock("@tauri-apps/api/path", async () => {
    const path = await import("node:path");
    return {
        resolve: async (...parts: string[]) => path.resolve(...parts),
        basename: async (file: string) => path.basename(file),
    };
});

vi.mock("@tauri-apps/plugin-fs", async () => {
    const fs = await import("node:fs/promises");
    return {
        exists: async (path: string) =>
            fs.access(path).then(
                () => true,
                () => false,
            ),
        mkdir: fs.mkdir,
        copyFile: fs.copyFile,
        stat: fs.stat,
        readTextFile: (path: string) => fs.readFile(path, "utf8"),
        writeTextFile: fs.writeFile,
        readDir: async (path: string) =>
            (await fs.readdir(path, { withFileTypes: true })).map((entry) => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                isFile: entry.isFile(),
            })),
        remove: (path: string, options?: { recursive?: boolean }) => fs.rm(path, options),
        rename: async (from: string, to: string) => {
            if (state.failRename) {
                state.failRename = false;
                throw new Error("Disk error");
            }
            await fs.rename(from, to);
        },
    };
});

import { importCourse, listCourses, readCourse, updateCourseProgress } from "./storage";

let directory: string;
let source: string;
let stored: StoredCourse;
const first = '[Event "First"]\n\n{Keep this comment.} 1. e4 e5 (1... c5 {Keep variation.}) *';
const second = '[Event "Second"]\n[Topic "Endgames"]\n\n1. d4 d5 *';

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "en-croissant-courses-"));
    source = join(directory, "source.pgn");
    state.games = [first, second];
    state.failRename = false;
    await writeFile(source, state.games.join("\n\n"));
    stored = await importCourse({
        libraryDir: directory,
        title: "Study",
        description: "Two themes",
        sources: [{ path: source, name: "source.pgn", topic: "Tactics", side: "auto" }],
    });
});

afterEach(async () => {
    if (!directory.startsWith(join(tmpdir(), "en-croissant-courses-")))
        throw new Error("Unexpected test path");
    await rm(directory, { recursive: true, force: true });
});

describe("native course library storage", () => {
    it("preserves raw PGNs and stays usable after the selected source is moved", async () => {
        await rm(source);
        const reopened = await readCourse(directory, stored.course.id);
        expect(reopened.course.lessons.map((lesson) => lesson.pgn)).toEqual([first, second]);
        expect(reopened.course.lessons.map((lesson) => lesson.topic)).toEqual([
            "Tactics",
            "Endgames",
        ]);
        const sourceCopy = join(
            directory,
            "courses",
            stored.course.id,
            stored.course.sources[0].id + ".pgn",
        );
        expect(await readFile(sourceCopy, "utf8")).toBe(first + "\n\n" + second);
    });

    it("rolls back a failed import without affecting existing courses", async () => {
        state.games = [first, "1. e4 e5 (1... e4) *"];
        await writeFile(source, state.games.join("\n\n"));
        await expect(
            importCourse({
                libraryDir: directory,
                title: "Broken",
                description: "",
                sources: [{ path: source, name: "source.pgn", topic: "Tactics", side: "auto" }],
            }),
        ).rejects.toMatchObject({ code: "illegalMove", details: { file: "source.pgn", game: 2 } });
        expect(await readdir(join(directory, "courses"))).toEqual([stored.course.id]);
        expect((await listCourses(directory)).courses).toHaveLength(1);
    });

    it("combines several PGN files and their themes into one course", async () => {
        const other = join(directory, "other.pgn");
        await writeFile(other, state.games.join("\n\n"));
        const imported = await importCourse({
            libraryDir: directory,
            title: "Combined",
            description: "",
            sources: [
                { path: source, name: "source.pgn", topic: "Tactics", side: "white" },
                { path: other, name: "other.pgn", topic: "Openings", side: "black" },
            ],
        });
        expect(imported.course.sources).toHaveLength(2);
        expect(imported.course.lessons).toHaveLength(4);
        expect(imported.course.lessons.map((lesson) => lesson.topic)).toEqual([
            "Tactics",
            "Endgames",
            "Openings",
            "Endgames",
        ]);
        expect(imported.course.lessons[2].trainingSide).toBe("black");
    });

    it("rejects an incomplete native scan instead of silently dropping a game", async () => {
        state.games = [first];
        await expect(
            importCourse({
                libraryDir: directory,
                title: "Incomplete scan",
                description: "",
                sources: [{ path: source, name: "source.pgn", topic: "Tactics", side: "auto" }],
            }),
        ).rejects.toMatchObject({ code: "invalidPgn", details: { file: "source.pgn" } });
        expect(await readdir(join(directory, "courses"))).toEqual([stored.course.id]);
    });

    it("keeps both completion writes when two lessons are updated together", async () => {
        const [a, b] = stored.course.lessons;
        await Promise.all([
            updateCourseProgress(directory, stored.course.id, a.id, "complete"),
            updateCourseProgress(directory, stored.course.id, b.id, "complete"),
        ]);
        const reopened = await readCourse(directory, stored.course.id);
        expect(Object.keys(reopened.progress.completed).sort()).toEqual([a.id, b.id].sort());
        await updateCourseProgress(directory, stored.course.id, a.id, "uncomplete");
        expect(
            Object.keys((await readCourse(directory, stored.course.id)).progress.completed),
        ).toEqual([b.id]);
    });

    it("keeps previous progress if replacement fails and allows retrying", async () => {
        const lesson = stored.course.lessons[0];
        await updateCourseProgress(directory, stored.course.id, lesson.id, "complete");
        state.failRename = true;
        await expect(
            updateCourseProgress(directory, stored.course.id, lesson.id, "uncomplete"),
        ).rejects.toThrow("Disk error");
        expect(
            (await readCourse(directory, stored.course.id)).progress.completed[lesson.id],
        ).toBeDefined();
        await updateCourseProgress(directory, stored.course.id, lesson.id, "uncomplete");
        expect(
            (await readCourse(directory, stored.course.id)).progress.completed[lesson.id],
        ).toBeUndefined();
    });

    it("reports a corrupt course without hiding or overwriting a healthy one", async () => {
        const damagedId = crypto.randomUUID();
        const { mkdir } = await import("node:fs/promises");
        await mkdir(join(directory, "courses", damagedId));
        await writeFile(join(directory, "courses", damagedId, "course.json"), "broken");
        const library = await listCourses(directory);
        expect(library.courses.map((entry) => entry.course.id)).toEqual([stored.course.id]);
        expect(library.warnings).toEqual([damagedId]);
        expect(await readFile(join(directory, "courses", damagedId, "course.json"), "utf8")).toBe(
            "broken",
        );
    });

    it("rejects traversal and unknown lessons in progress updates", async () => {
        await expect(readCourse(directory, "../outside")).rejects.toThrow(/uuid/i);
        await expect(
            updateCourseProgress(directory, stored.course.id, crypto.randomUUID(), "complete"),
        ).rejects.toMatchObject({ code: "missingLesson" });
    });
});
