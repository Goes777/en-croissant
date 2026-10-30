import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Pagination,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBook,
  IconBooks,
  IconCheck,
  IconCircle,
  IconFileImport,
  IconPlayerPlay,
  IconSearch,
} from "@tabler/icons-react";
import { useLoaderData, useNavigate, useSearch } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR, { mutate as mutateGlobal } from "swr";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { courseErrorMessage } from "./errors";
import ImportCourseModal from "./ImportCourseModal";
import { type CourseLesson, type StoredCourse, courseStats } from "./model";
import { openCourseLesson } from "./open";
import { listCourses, updateCourseProgress } from "./storage";
import classes from "./CoursesPage.module.css";
import { exportDesktopMigration } from "./migration";

export default function CoursesPage() {
  const { t } = useTranslation();
  const { documentDir } = useLoaderData({ from: "/courses" });
  const search = useSearch({ from: "/courses" });
  const navigate = useNavigate();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const { data, error, isLoading, mutate } = useSWR(["courses", documentDir], () =>
    listCourses(documentDir),
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(search.course ?? null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const courses = data?.courses ?? [];
  const filtered = courses.filter(({ course }) =>
    [course.title, course.description, ...course.lessons.map((lesson) => lesson.topic)]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const selected = filtered.find(({ course }) => course.id === selectedId) ?? filtered[0];

  async function handleOpen(
    stored: StoredCourse,
    lesson: CourseLesson,
    mode: "study" | "practice",
  ) {
    setBusy(true);
    try {
      await openCourseLesson({
        libraryDir: documentDir,
        course: stored.course,
        lesson,
        mode,
        setTabs,
        setActiveTab,
      });
      await navigate({ to: "/" });
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

  async function handleComplete(stored: StoredCourse, lesson: CourseLesson) {
    setBusy(true);
    try {
      const progress = await updateCourseProgress(
        documentDir,
        stored.course.id,
        lesson.id,
        stored.progress.completed[lesson.id] === undefined ? "complete" : "uncomplete",
      );
      await mutate(
        (previous) =>
          previous && {
            ...previous,
            courses: previous.courses.map((entry) =>
              entry.course.id === stored.course.id ? { ...entry, progress } : entry,
            ),
          },
        false,
      );
      void mutateGlobal(["course", documentDir, stored.course.id]);
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
    <div className={classes.page}>
      <Group justify="space-between">
        <Group gap="sm">
          <ThemeIcon variant="light" size="lg">
            <IconBooks size={22} />
          </ThemeIcon>
          <div>
            <Title order={3}>{t("Courses.Title")}</Title>
            <Text size="xs" c="dimmed">
              {t("Courses.Description")}
            </Text>
          </div>
        </Group>
        <Group>
          <Button
            variant="default"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await exportDesktopMigration(documentDir);
              } catch (cause) {
                notifications.show({ color: "red", message: String(cause) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Courses.ExportMigration")}
          </Button>
          <Button leftSection={<IconFileImport size={16} />} onClick={() => setImporting(true)}>
            {t("Courses.Import.Title")}
          </Button>
        </Group>
      </Group>
      {data && data.warnings.length > 0 && (
        <Alert color="yellow">{t("Courses.LibraryWarning", { count: data.warnings.length })}</Alert>
      )}
      {error ? (
        <Alert color="red" title={t("Common.Error")}>
          <Stack gap="xs">
            <Text size="sm">{courseErrorMessage(error, t)}</Text>
            <Button variant="light" size="xs" onClick={() => void mutate()}>
              {t("Courses.Retry")}
            </Button>
          </Stack>
        </Alert>
      ) : isLoading ? (
        <Center flex={1}>
          <Loader />
        </Center>
      ) : !courses.length ? (
        <Center flex={1}>
          <Stack align="center" maw={460} gap="sm">
            <ThemeIcon variant="light" size={64} radius="xl">
              <IconBooks size={32} />
            </ThemeIcon>
            <Title order={4}>{t("Courses.Empty.Title")}</Title>
            <Text size="sm" c="dimmed" ta="center">
              {t("Courses.Empty.Description")}
            </Text>
            <Button variant="light" onClick={() => setImporting(true)}>
              {t("Courses.Import.Title")}
            </Button>
          </Stack>
        </Center>
      ) : (
        <div className={classes.workspace}>
          <Paper withBorder p="sm" className={classes.list}>
            <TextInput
              aria-label={t("Courses.Search")}
              placeholder={t("Courses.Search")}
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              mb="sm"
            />
            <ScrollArea flex={1} type="auto" offsetScrollbars>
              <Stack gap="xs">
                {filtered.map((stored) => {
                  const stats = courseStats(stored);
                  return (
                    <UnstyledButton
                      key={stored.course.id}
                      className={classes.course}
                      data-selected={selected?.course.id === stored.course.id}
                      aria-pressed={selected?.course.id === stored.course.id}
                      onClick={() => setSelectedId(stored.course.id)}
                    >
                      <Stack gap={7}>
                        <Group gap="xs" wrap="nowrap">
                          <IconBook size={18} style={{ flexShrink: 0 }} />
                          <Text size="sm" fw={600} lineClamp={2}>
                            {stored.course.title}
                          </Text>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {t("Courses.Counts", {
                            lessons: stats.total,
                            topics: stats.topics.length,
                          })}
                        </Text>
                        <Progress value={stats.percent} size="xs" />
                        <Text size="xs" c="dimmed">
                          {t("Courses.Completed", {
                            completed: stats.completed,
                            total: stats.total,
                          })}
                        </Text>
                      </Stack>
                    </UnstyledButton>
                  );
                })}
                {!filtered.length && (
                  <Text size="sm" c="dimmed" p="sm">
                    {t("Courses.NoResults")}
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Paper>
          {selected && (
            <CourseDetail
              key={selected.course.id}
              stored={selected}
              busy={busy}
              onOpen={(lesson, mode) => void handleOpen(selected, lesson, mode)}
              onComplete={(lesson) => void handleComplete(selected, lesson)}
            />
          )}
        </div>
      )}
      {importing && (
        <ImportCourseModal
          opened
          libraryDir={documentDir}
          onClose={() => setImporting(false)}
          onImported={async (stored) => {
            await mutate(
              (previous) => ({
                courses: [stored, ...(previous?.courses ?? [])],
                warnings: previous?.warnings ?? [],
              }),
              false,
            );
            setQuery("");
            setSelectedId(stored.course.id);
          }}
        />
      )}
    </div>
  );
}

function CourseDetail({
  stored,
  busy,
  onOpen,
  onComplete,
}: {
  stored: StoredCourse;
  busy: boolean;
  onOpen: (lesson: CourseLesson, mode: "study" | "practice") => void;
  onComplete: (lesson: CourseLesson) => void;
}) {
  const { t } = useTranslation();
  const { course, progress } = stored;
  const stats = courseStats(stored);
  const [topic, setTopic] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const lessonNumbers = new Map(course.lessons.map((lesson, index) => [lesson.id, index + 1]));
  const lessons = course.lessons.filter((lesson) => !topic || lesson.topic === topic);
  const resume =
    course.lessons.find(
      (lesson) =>
        lesson.id === progress.lastLessonId && progress.completed[lesson.id] === undefined,
    ) ??
    course.lessons.find((lesson) => progress.completed[lesson.id] === undefined) ??
    course.lessons[0];

  return (
    <Paper withBorder p="md" className={classes.detail}>
      <Stack gap="sm" mb="md">
        <Group justify="space-between" align="start">
          <div>
            <Title order={4}>{course.title}</Title>
            <Text size="xs" c="dimmed">
              {t("Courses.Counts", { lessons: stats.total, topics: stats.topics.length })}
            </Text>
          </div>
          <Badge variant="light" color={stats.percent === 100 ? "green" : undefined}>
            {stats.percent}%
          </Badge>
        </Group>
        {course.description && (
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {course.description}
          </Text>
        )}
        <Progress value={stats.percent} size="sm" />
        <Group justify="space-between" align="end">
          <Select
            label={t("Courses.FilterTopic")}
            placeholder={t("Courses.AllTopics")}
            clearable
            aria-label={t("Courses.FilterTopic")}
            data={stats.topics}
            value={topic}
            onChange={(value) => {
              setTopic(value);
              setPage(1);
            }}
            maw={300}
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            disabled={busy}
            onClick={() => onOpen(resume, "study")}
          >
            {t("Courses.Continue")}
          </Button>
        </Group>
      </Stack>
      <ScrollArea flex={1} type="auto" offsetScrollbars>
        <Stack gap="xs">
          {lessons.slice((page - 1) * 25, page * 25).map((lesson) => {
            const completed = progress.completed[lesson.id] !== undefined;
            return (
              <Paper key={lesson.id} withBorder p="sm">
                <Group gap="sm" align="start">
                  <Tooltip
                    label={completed ? t("Courses.MarkIncomplete") : t("Courses.MarkComplete")}
                  >
                    <ActionIcon
                      variant={completed ? "light" : "subtle"}
                      color={completed ? "green" : "gray"}
                      disabled={busy}
                      aria-label={
                        completed ? t("Courses.MarkIncomplete") : t("Courses.MarkComplete")
                      }
                      onClick={() => onComplete(lesson)}
                    >
                      {completed ? <IconCheck size={18} /> : <IconCircle size={18} />}
                    </ActionIcon>
                  </Tooltip>
                  <div className={classes.lessonTitle}>
                    <Text size="sm" fw={600}>
                      {lessonNumbers.get(lesson.id)}. {lesson.title}
                    </Text>
                    <Group gap={5} mt={4}>
                      <Badge size="xs" variant="light">
                        {lesson.topic}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {t("Courses.MoveCount", { count: lesson.mainlineMoves })}
                      </Text>
                      {lesson.variationMoves > 0 && (
                        <Text size="xs" c="dimmed">
                          {t("Courses.VariationCount", { count: lesson.variationMoves })}
                        </Text>
                      )}
                    </Group>
                    {lesson.introduction && (
                      <Text size="xs" c="dimmed" lineClamp={2} mt={5}>
                        {lesson.introduction}
                      </Text>
                    )}
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="default"
                      disabled={busy}
                      onClick={() => onOpen(lesson, "study")}
                    >
                      {t("Courses.Study")}
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={busy || lesson.trainingPositions === 0}
                      onClick={() => onOpen(lesson, "practice")}
                    >
                      {t("Courses.Practice")}
                    </Button>
                  </Group>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </ScrollArea>
      {lessons.length > 25 && (
        <Pagination
          mt="sm"
          total={Math.ceil(lessons.length / 25)}
          value={page}
          onChange={setPage}
        />
      )}
      <Text size="xs" c="dimmed" mt="sm">
        {t("Courses.ProgressHelp")}
      </Text>
    </Paper>
  );
}
