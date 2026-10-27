import { describe, expect, it } from "vitest";
import { getPracticeSource, type Tab } from "@/utils/tabs";
import { CourseError, courseSchema, courseStats, emptyProgress, inspectCourseGame } from "./model";

const courseId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const lessonId = "00000000-0000-4000-8000-000000000003";
const pgn =
    '[Event "A {brace} in a header"]\n[Topic "Development"]\n\n{Develop your pieces.}\n1. e4 {Centre} e5 (1... c5 $1 {Sicilian}) 2. Nf3 *';

describe("PGN course content", () => {
    it("indexes comments, topics and legal variations without changing the PGN", () => {
        const result = inspectCourseGame(pgn);
        expect(result.title).toBe("A {brace} in a header");
        expect(result.topic).toBe("Development");
        expect(result.introduction).toBe("Develop your pieces.");
        expect(result.mainlineMoves).toBe(3);
        expect(result.variationMoves).toBe(1);
        expect(result.trainingPositions.white).toBe(2);
        expect(result.trainingPositions.black).toBe(1);
    });

    it("uses the side to move in a black-to-move FEN", () => {
        const result = inspectCourseGame(
            '[FEN "7k/6p1/8/8/8/8/6P1/K7 b - - 0 1"]\n\n1... g6 2. g3 *',
        );
        expect(result.initialSide).toBe("black");
        expect(result.trainingPositions.black).toBe(1);
    });

    it("checks legality inside variations, not just the main line", () => {
        expect(() => inspectCourseGame("1. e4 e5 (1... e4) *")).toThrow("illegalMove");
    });

    it.each([
        "1. e4 garbage e5 *",
        "1. e4 {unfinished comment",
        "1. e4 (1. d4 *",
        '[Start "not JSON"]\n\n1. e4 *',
        '[FEN "invalid"]\n\n1. e4 *',
        '[Variant "Atomic"]\n\n1. e4 *',
        "just arbitrary text",
        "*",
        "1. e4 *\n\n1. d4 *",
    ])("rejects invalid or unsupported content: %s", (input) => {
        expect(() => inspectCourseGame(input)).toThrow(CourseError);
    });

    it("allows a commented theory position without inventing trainable moves", () => {
        const result = inspectCourseGame('[Event "Theory"]\n\n{Study the starting position.} *');
        expect(result.mainlineMoves).toBe(0);
        expect(result.trainingPositions).toEqual({ white: 0, black: 0 });
    });
});

describe("course identity and progress", () => {
    const course = {
        version: 1 as const,
        id: courseId,
        title: "Course",
        description: "",
        createdAt: 0,
        sources: [{ id: sourceId, name: "lesson.pgn", topic: "Tactics", side: "auto" as const }],
        lessons: [
            {
                id: lessonId,
                sourceId,
                sourceGame: 0,
                title: "Lesson",
                topic: "Tactics",
                introduction: "",
                pgn,
                trainingSide: "white" as const,
                trainingPositions: 2,
                mainlineMoves: 3,
                variationMoves: 1,
            },
        ],
    };

    it("rejects dangling sources and duplicate lesson IDs", () => {
        expect(
            courseSchema.safeParse({ ...course, sources: [{ ...course.sources[0], id: courseId }] })
                .success,
        ).toBe(false);
        expect(
            courseSchema.safeParse({ ...course, lessons: [...course.lessons, course.lessons[0]] })
                .success,
        ).toBe(false);
    });

    it("only counts real completed lessons", () => {
        const progress = emptyProgress(courseId);
        progress.completed[sourceId] = 1;
        expect(courseStats({ course, progress }).percent).toBe(0);
        progress.completed[lessonId] = 1;
        expect(courseStats({ course, progress }).percent).toBe(100);
    });

    it("keeps review decks isolated between course lessons and ordinary files", () => {
        const tab: Tab = {
            name: "Lesson",
            type: "analysis",
            value: "tab",
            gameOrigin: { kind: "none" },
            course: { courseId, lessonId, libraryDir: "library", mode: "practice" },
        };
        const a = getPracticeSource(tab);
        const b = getPracticeSource({ ...tab, course: { ...tab.course!, lessonId: sourceId } });
        expect(a).not.toEqual(b);
        expect(a).not.toEqual(getPracticeSource({ ...tab, course: undefined }));
    });
});
