import { type Position } from "chessops/chess";
import { makeFen } from "chessops/fen";
import {
    emptyHeaders,
    type Game,
    type Node,
    type PgnNodeData,
    PgnParser,
    startingPosition,
} from "chessops/pgn";
import { parseSan } from "chessops/san";
import { z } from "zod";

export const courseIdSchema = z.string().uuid();
export const trainingSideSchema = z.enum(["auto", "white", "black"]);
const timestamp = z.number().int().nonnegative();

const sourceSchema = z.object({
    id: courseIdSchema,
    name: z.string().min(1),
    topic: z.string().trim().min(1),
    side: trainingSideSchema,
});

const lessonSchema = z.object({
    id: courseIdSchema,
    sourceId: courseIdSchema,
    sourceGame: z.number().int().nonnegative(),
    title: z.string().trim().min(1),
    topic: z.string().trim().min(1),
    introduction: z.string(),
    pgn: z.string().min(1),
    trainingSide: z.enum(["white", "black"]),
    trainingPositions: z.number().int().nonnegative(),
    mainlineMoves: z.number().int().nonnegative(),
    variationMoves: z.number().int().nonnegative(),
});

export const courseSchema = z
    .object({
        version: z.literal(1),
        id: courseIdSchema,
        title: z.string().trim().min(1).max(160),
        description: z.string().max(4000),
        createdAt: timestamp,
        sources: z.array(sourceSchema).min(1),
        lessons: z.array(lessonSchema).min(1),
    })
    .superRefine((course, ctx) => {
        const sources = new Map(course.sources.map((source) => [source.id, source]));
        if (
            sources.size !== course.sources.length ||
            new Set(course.lessons.map((lesson) => lesson.id)).size !== course.lessons.length ||
            new Set(course.lessons.map((lesson) => lesson.sourceId + ":" + lesson.sourceGame))
                .size !== course.lessons.length ||
            course.lessons.some((lesson) => !sources.has(lesson.sourceId))
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Inconsistent course references",
            });
        }
    });

export const progressSchema = z.object({
    version: z.literal(1),
    courseId: courseIdSchema,
    completed: z.record(courseIdSchema, timestamp),
    lastLessonId: courseIdSchema.optional(),
    lastOpenedAt: timestamp.optional(),
});

export const courseContextSchema = z.object({
    courseId: courseIdSchema,
    lessonId: courseIdSchema,
    libraryDir: z.string().min(1),
    mode: z.enum(["study", "practice"]),
});

export type Course = z.infer<typeof courseSchema>;
export type CourseLesson = z.infer<typeof lessonSchema>;
export type CourseProgress = z.infer<typeof progressSchema>;
export type CourseContext = z.infer<typeof courseContextSchema>;
export type StoredCourse = { course: Course; progress: CourseProgress };
export type CourseSourceInput = {
    path: string;
    name: string;
    topic: string;
    side: z.infer<typeof trainingSideSchema>;
};

export class CourseError extends Error {
    constructor(
        public readonly code:
            | "invalidPgn"
            | "illegalMove"
            | "invalidPosition"
            | "unsupportedVariant"
            | "emptyPgn"
            | "largeFile"
            | "invalidCourse"
            | "missingLesson",
        public readonly details: { file?: string; game?: number; move?: string } = {},
    ) {
        super(code);
    }
}

// chessops deliberately skips unknown tokens. Count the source move tokens as
// well, so an import cannot silently turn a broken line into a shorter exercise.
function countMoveTokens(text: string): number {
    let index = 0;
    let count = 0;
    let depth = 0;
    while (index < text.length) {
        const rest = text.slice(index);
        const char = text[index];
        const whitespace = /^\s+/.exec(rest);
        if (whitespace) {
            index += whitespace[0].length;
            continue;
        }
        if (
            char === ";" ||
            (char === "%" && /^\s*$/.test(text.slice(text.lastIndexOf("\n", index - 1) + 1, index)))
        ) {
            const end = text.indexOf("\n", index);
            index = end === -1 ? text.length : end + 1;
            continue;
        }
        if (char === "{") {
            const end = text.indexOf("}", index + 1);
            if (end === -1 || text.slice(index + 1, end).includes("{"))
                throw new CourseError("invalidPgn");
            index = end + 1;
            continue;
        }
        if (char === "[") {
            const header = /^\[\s*\w+\s+"(?:\\.|[^"\\])*"\s*\]/.exec(rest);
            if (!header) throw new CourseError("invalidPgn");
            index += header[0].length;
            continue;
        }
        if (char === "(" || char === ")") {
            depth += char === "(" ? 1 : -1;
            if (depth < 0) throw new CourseError("invalidPgn");
            index++;
            continue;
        }
        const annotation = /^(?:\$\d+|[!?]+|\d+\.(?:\.\.)?|\.\.\.|e\.p\.)/.exec(rest);
        if (annotation) {
            index += annotation[0].length;
            continue;
        }
        const result = /^(?:1\/2-1\/2|1-0|0-1|\*)(?=\s|[();{}]|$)/.exec(rest);
        if (result) {
            index += result[0].length;
            continue;
        }
        const token = /^[^\s{}[\]();$!?]+/.exec(rest);
        if (!token) throw new CourseError("invalidPgn");
        count++;
        index += token[0].length;
    }
    if (depth !== 0) throw new CourseError("invalidPgn");
    return count;
}

function meaningful(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed !== "?" && trimmed !== "-" ? trimmed : undefined;
}

function parseCoursePgn(pgn: string) {
    const clean = pgn.replace(/^\uFEFF/, "");
    const tokenCount = countMoveTokens(clean);
    const games: Game<PgnNodeData>[] = [];
    let failed = false;
    new PgnParser(
        (game, error) => {
            failed ||= !!error;
            games.push(game);
        },
        emptyHeaders,
        5_000_000,
    ).parse(clean);
    if (failed) throw new CourseError("invalidPgn");
    return { games, tokenCount };
}

export function inspectCourseSource(pgn: string) {
    const { games, tokenCount } = parseCoursePgn(pgn);
    if (!games.length) throw new CourseError("emptyPgn");
    let moves = 0;
    const stack: Node<PgnNodeData>[] = games.map((game) => game.moves);
    while (stack.length) {
        const node = stack.pop()!;
        moves += node.children.length;
        for (const child of node.children) stack.push(child);
    }
    if (moves !== tokenCount) throw new CourseError("invalidPgn");
    return { games: games.length, moves };
}

export function inspectCourseGame(pgn: string, options: { allowTerminalNullMoves?: boolean } = {}) {
    const { games, tokenCount } = parseCoursePgn(pgn);
    if (games.length !== 1) throw new CourseError("invalidPgn");
    const game = games[0];
    try {
        const start = JSON.parse(game.headers.get("Start") ?? "[]");
        if (!z.array(z.number().int().nonnegative()).safeParse(start).success) throw new Error();
    } catch {
        throw new CourseError("invalidPgn");
    }
    const variant = game.headers.get("Variant");
    if (variant && !["standard", "chess", "normal"].includes(variant.toLowerCase())) {
        throw new CourseError("unsupportedVariant");
    }
    const initial = startingPosition(game.headers);
    if (initial.isErr) throw new CourseError("invalidPosition");
    const position = initial.unwrap();
    const trainingPositions = { white: new Set<string>(), black: new Set<string>() };
    const stack: { node: Node<PgnNodeData>; position: Position; key: string }[] = [
        { node: game.moves, position, key: makeFen(position.toSetup()) },
    ];
    let moves = 0;
    while (stack.length) {
        const item = stack.pop()!;
        if (item.node.children.length) trainingPositions[item.position.turn].add(item.key);
        for (const child of item.node.children) {
            // Some lesson databases use a terminal -- as a diagram/end marker.
            // It is counted for source fidelity, never played as a legal move.
            if (
                options.allowTerminalNullMoves &&
                child.data.san === "--" &&
                !child.children.length
            ) {
                moves++;
                continue;
            }
            const next = item.position.clone();
            const move = parseSan(next, child.data.san);
            if (!move || !next.isLegal(move)) {
                throw new CourseError("illegalMove", { move: child.data.san });
            }
            next.play(move);
            moves++;
            // A normalized setup key keeps duplicate positions in variations from
            // inflating the training count; the existing trainer also deduplicates.
            const key = makeFen(next.toSetup());
            stack.push({ node: child, position: next, key });
        }
    }
    if (moves !== tokenCount) throw new CourseError("invalidPgn");
    if (
        moves === 0 &&
        !game.comments?.some((comment) => comment.trim()) &&
        !game.headers.has("FEN")
    ) {
        throw new CourseError("emptyPgn");
    }
    const mainlineMoves = Array.from(game.moves.mainline()).length;
    const title =
        meaningful(game.headers.get("Title")) ??
        meaningful(game.headers.get("Chapter")) ??
        meaningful(game.headers.get("Event")) ??
        [meaningful(game.headers.get("White")), meaningful(game.headers.get("Black"))]
            .filter(Boolean)
            .join(" × ");
    return {
        title,
        topic: meaningful(game.headers.get("Topic")) ?? meaningful(game.headers.get("Theme")),
        introduction: (game.comments ?? []).join("\n"),
        initialSide: position.turn,
        trainingPositions: {
            white: trainingPositions.white.size,
            black: trainingPositions.black.size,
        },
        mainlineMoves,
        variationMoves: moves - mainlineMoves,
    };
}

export function emptyProgress(courseId: string): CourseProgress {
    return { version: 1, courseId, completed: {} };
}

export function courseStats({ course, progress }: StoredCourse) {
    const completed = course.lessons.filter(
        (lesson) => progress.completed[lesson.id] !== undefined,
    ).length;
    return {
        completed,
        total: course.lessons.length,
        percent: Math.round((completed / course.lessons.length) * 100),
        topics: [...new Set(course.lessons.map((lesson) => lesson.topic))],
    };
}
