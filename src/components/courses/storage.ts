import { basename, resolve } from "@tauri-apps/api/path";
import {
    copyFile,
    exists,
    mkdir,
    readDir,
    readTextFile,
    remove,
    rename,
    stat,
    writeTextFile,
} from "@tauri-apps/plugin-fs";
import { commands } from "@/bindings";
import { unwrap } from "@/utils/unwrap";
import {
    type Course,
    type CourseProgress,
    type CourseSourceInput,
    type StoredCourse,
    CourseError,
    courseIdSchema,
    courseSchema,
    emptyProgress,
    inspectCourseGame,
    inspectCourseSource,
    progressSchema,
} from "./model";

export async function coursesDirectory(libraryDir: string) {
    const directory = await resolve(libraryDir, "courses");
    if (!(await exists(directory))) await mkdir(directory, { recursive: true });
    return directory;
}

async function courseDirectory(libraryDir: string, courseId: string) {
    return resolve(await coursesDirectory(libraryDir), courseIdSchema.parse(courseId));
}

export async function readCourse(libraryDir: string, courseId: string): Promise<StoredCourse> {
    const directory = await courseDirectory(libraryDir, courseId);
    const course = courseSchema.parse(
        JSON.parse(await readTextFile(await resolve(directory, "course.json"))),
    );
    if (course.id !== courseId) throw new CourseError("invalidCourse");
    const progressPath = await resolve(directory, "progress.json");
    const progress = (await exists(progressPath))
        ? progressSchema.parse(JSON.parse(await readTextFile(progressPath)))
        : emptyProgress(courseId);
    if (progress.courseId !== courseId) throw new CourseError("invalidCourse");
    return { course, progress };
}

export async function listCourses(libraryDir: string) {
    const directory = await coursesDirectory(libraryDir);
    const entries = await readDir(directory);
    const loaded = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory && courseIdSchema.safeParse(entry.name).success)
            .map(async (entry) => {
                try {
                    return { stored: await readCourse(libraryDir, entry.name) };
                } catch {
                    return { warning: entry.name };
                }
            }),
    );
    const courses = loaded.flatMap((entry) => (entry.stored ? [entry.stored] : []));
    courses.sort(
        (a, b) =>
            (b.progress.lastOpenedAt ?? b.course.createdAt) -
            (a.progress.lastOpenedAt ?? a.course.createdAt),
    );
    return { courses, warnings: loaded.flatMap((entry) => (entry.warning ? [entry.warning] : [])) };
}

export type ImportProgress = { file: string; game: number; total: number };

export async function importCourse({
    libraryDir,
    title,
    description,
    sources,
    onProgress,
}: {
    libraryDir: string;
    title: string;
    description: string;
    sources: CourseSourceInput[];
    onProgress?: (progress: ImportProgress) => void;
}): Promise<StoredCourse> {
    if (
        !title.trim() ||
        title.trim().length > 160 ||
        description.length > 4000 ||
        !sources.length ||
        sources.some((source) => !source.topic.trim() || !source.path)
    ) {
        throw new CourseError("invalidCourse");
    }
    const root = await coursesDirectory(libraryDir);
    const id = crypto.randomUUID();
    const staging = await resolve(root, ".import-" + id);
    const destination = await resolve(root, id);
    await mkdir(staging);
    try {
        const course: Course = {
            version: 1,
            id,
            title: title.trim(),
            description: description.trim(),
            createdAt: Date.now(),
            sources: [],
            lessons: [],
        };
        for (const input of sources) {
            const name = await basename(input.path);
            const info = await stat(input.path);
            if (info.size > 20_000_000) throw new CourseError("largeFile", { file: name });
            const sourceId = crypto.randomUUID();
            const copiedPath = await resolve(staging, sourceId + ".pgn");
            // Read a stable private copy. Moving or editing the selected source
            // after import does not break a course or change its expected moves.
            await copyFile(input.path, copiedPath);
            if ((await stat(copiedPath)).size > 20_000_000)
                throw new CourseError("largeFile", { file: name });
            let sourceStats;
            try {
                sourceStats = inspectCourseSource(await readTextFile(copiedPath));
            } catch (error) {
                if (error instanceof CourseError)
                    throw new CourseError(error.code, { ...error.details, file: name });
                throw error;
            }
            const total = unwrap(await commands.countPgnGames(copiedPath));
            if (total === 0) throw new CourseError("emptyPgn", { file: name });
            if (total !== sourceStats.games) throw new CourseError("invalidPgn", { file: name });
            let sourceMoves = 0;
            course.sources.push({
                id: sourceId,
                name,
                topic: input.topic.trim(),
                side: input.side,
            });
            for (let batch = 0; batch < total; batch += 50) {
                const end = Math.min(total - 1, batch + 49);
                const games = unwrap(await commands.readGames(copiedPath, batch, end));
                if (games.length !== end - batch + 1)
                    throw new CourseError("invalidPgn", { file: name });
                for (const [offset, pgn] of games.entries()) {
                    const index = batch + offset;
                    onProgress?.({ file: name, game: index + 1, total });
                    try {
                        const summary = inspectCourseGame(pgn);
                        sourceMoves += summary.mainlineMoves + summary.variationMoves;
                        const trainingSide =
                            input.side === "auto" ? summary.initialSide : input.side;
                        course.lessons.push({
                            id: crypto.randomUUID(),
                            sourceId,
                            sourceGame: index,
                            title: summary.title || input.topic.trim() + " · " + (index + 1),
                            topic: summary.topic ?? input.topic.trim(),
                            introduction: summary.introduction,
                            pgn,
                            trainingSide,
                            trainingPositions: summary.trainingPositions[trainingSide],
                            mainlineMoves: summary.mainlineMoves,
                            variationMoves: summary.variationMoves,
                        });
                    } catch (error) {
                        if (error instanceof CourseError) {
                            throw new CourseError(error.code, {
                                ...error.details,
                                file: name,
                                game: index + 1,
                            });
                        }
                        throw error;
                    }
                }
            }
            if (sourceMoves !== sourceStats.moves)
                throw new CourseError("invalidPgn", { file: name });
        }
        const validated = courseSchema.parse(course);
        await writeTextFile(
            await resolve(staging, "course.json"),
            JSON.stringify(validated, null, 2),
        );
        // Only a complete, validated course becomes visible in the library.
        await rename(staging, destination);
        return { course: validated, progress: emptyProgress(id) };
    } catch (error) {
        // The generated staging directory belongs only to this import.
        await remove(staging, { recursive: true }).catch(console.error);
        throw error;
    }
}

let progressQueue: Promise<unknown> = Promise.resolve();

export function updateCourseProgress(
    libraryDir: string,
    courseId: string,
    lessonId: string,
    action: "open" | "complete" | "uncomplete",
): Promise<CourseProgress> {
    const operation = progressQueue.then(async () => {
        const { course, progress } = await readCourse(libraryDir, courseId);
        if (!course.lessons.some((lesson) => lesson.id === lessonId))
            throw new CourseError("missingLesson");
        const next: CourseProgress = {
            ...progress,
            completed: { ...progress.completed },
            lastLessonId: lessonId,
            lastOpenedAt: Date.now(),
        };
        if (action === "complete") next.completed[lessonId] = Date.now();
        if (action === "uncomplete") delete next.completed[lessonId];
        const directory = await courseDirectory(libraryDir, courseId);
        const temporary = await resolve(directory, ".progress-" + crypto.randomUUID() + ".tmp");
        try {
            await writeTextFile(temporary, JSON.stringify(progressSchema.parse(next), null, 2));
            await rename(temporary, await resolve(directory, "progress.json"));
        } catch (error) {
            await remove(temporary).catch(console.error);
            throw error;
        }
        return next;
    });
    // Serialize writes and keep a failed save from blocking future attempts.
    progressQueue = operation.catch(() => undefined);
    return operation;
}
