import { getDefaultStore } from "jotai";
import type { Dispatch, SetStateAction } from "react";
import { mutate } from "swr";
import { tabFamily } from "@/state/atoms";
import { createTab, type Tab } from "@/utils/tabs";
import { type Course, type CourseLesson, inspectCourseGame } from "./model";
import { updateCourseProgress } from "./storage";

export async function openCourseLesson({
    libraryDir,
    course,
    lesson,
    mode,
    setTabs,
    setActiveTab,
}: {
    libraryDir: string;
    course: Course;
    lesson: CourseLesson;
    mode: "study" | "practice";
    setTabs: Dispatch<SetStateAction<Tab[]>>;
    setActiveTab: Dispatch<SetStateAction<string | null>>;
}) {
    const summary = inspectCourseGame(lesson.pgn);
    const resolvedMode =
        mode === "practice" && summary.trainingPositions[lesson.trainingSide] === 0
            ? "study"
            : mode;
    await updateCourseProgress(libraryDir, course.id, lesson.id, "open");
    const id = await createTab({
        tab: {
            name: course.title + " · " + lesson.title,
            type: "analysis",
            course: { courseId: course.id, lessonId: lesson.id, libraryDir, mode: resolvedMode },
        },
        pgn: lesson.pgn,
        headers: { orientation: lesson.trainingSide, start: [] },
        position: [],
        // Course content is immutable. Normal Save exports an independent PGN.
        gameOrigin: { kind: "none" },
        setTabs,
        setActiveTab,
    });
    getDefaultStore().set(tabFamily(id), resolvedMode === "practice" ? "practice" : "info");
    void mutate(["courses", libraryDir]);
    void mutate(["course", libraryDir, course.id]);
    return id;
}
