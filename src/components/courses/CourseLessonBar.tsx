import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconArrowRight, IconCheck } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR, { mutate as mutateGlobal } from "swr";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { courseErrorMessage } from "./errors";
import type { CourseContext, CourseLesson } from "./model";
import { openCourseLesson } from "./open";
import { readCourse, updateCourseProgress } from "./storage";

export default function CourseLessonBar({ context }: { context: CourseContext }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const [busy, setBusy] = useState(false);
  const { data, error, mutate } = useSWR(["course", context.libraryDir, context.courseId], () =>
    readCourse(context.libraryDir, context.courseId),
  );
  const index = data?.course.lessons.findIndex((entry) => entry.id === context.lessonId) ?? -1;
  const lesson = index >= 0 ? data?.course.lessons[index] : undefined;
  const next = index >= 0 ? data?.course.lessons[index + 1] : undefined;
  const completed = data?.progress.completed[context.lessonId] !== undefined;

  async function finish() {
    setBusy(true);
    try {
      const progress = await updateCourseProgress(
        context.libraryDir,
        context.courseId,
        context.lessonId,
        completed ? "uncomplete" : "complete",
      );
      await mutate((previous) => previous && { ...previous, progress }, false);
      void mutateGlobal(["courses", context.libraryDir]);
    } catch (cause) {
      notifications.show({
        title: t("Common.Error"),
        message: courseErrorMessage(cause, t),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  }

  async function openLesson(entry: CourseLesson, mode: "study" | "practice") {
    if (!data) return;
    setBusy(true);
    try {
      await openCourseLesson({
        libraryDir: context.libraryDir,
        course: data.course,
        lesson: entry,
        mode,
        setTabs,
        setActiveTab,
      });
    } catch (cause) {
      notifications.show({
        title: t("Common.Error"),
        message: courseErrorMessage(cause, t),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper withBorder px="sm" py="xs" mb="xs">
      <Stack gap={6}>
        <Group justify="space-between" gap="xs">
          <Group gap="xs" style={{ minWidth: 0, flex: 1 }} wrap="nowrap">
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconArrowLeft size={14} />}
              onClick={() =>
                void navigate({ to: "/courses", search: { course: context.courseId } })
              }
            >
              {t("Courses.Title")}
            </Button>
            {data ? (
              <Text size="sm" fw={600} truncate>
                {data.course.title}
              </Text>
            ) : (
              !error && <Loader size="xs" />
            )}
            {lesson && (
              <Badge variant="light" size="sm">
                {t("Courses.LessonNumber", {
                  number: index + 1,
                  total: data?.course.lessons.length,
                })}
              </Badge>
            )}
          </Group>
          {lesson && (
            <Group gap={6}>
              {context.mode === "study" && lesson.trainingPositions > 0 && (
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy}
                  onClick={() => void openLesson(lesson, "practice")}
                >
                  {t("Courses.Practice")}
                </Button>
              )}
              <Button
                size="xs"
                variant={completed ? "light" : "default"}
                color={completed ? "green" : undefined}
                loading={busy}
                leftSection={<IconCheck size={14} />}
                onClick={() => void finish()}
              >
                {completed ? t("Courses.MarkIncomplete") : t("Courses.MarkComplete")}
              </Button>
              {next && (
                <Button
                  size="xs"
                  variant="light"
                  disabled={busy}
                  rightSection={<IconArrowRight size={14} />}
                  onClick={() => void openLesson(next, context.mode)}
                >
                  {t("Courses.NextLesson")}
                </Button>
              )}
            </Group>
          )}
        </Group>
        {error ? (
          <Alert color="red" p="xs">
            {courseErrorMessage(error, t)}
          </Alert>
        ) : data && !lesson ? (
          <Alert color="yellow" p="xs">
            {t("Courses.Error.missingLesson")}
          </Alert>
        ) : (
          <Text size="xs" c="dimmed">
            {lesson?.title}
            {lesson ? " · " : ""}
            {t(context.mode === "practice" ? "Courses.PracticeHelp" : "Courses.StudyHelp")}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
