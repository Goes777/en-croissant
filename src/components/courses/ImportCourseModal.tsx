import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconFileImport, IconPlus, IconTrash } from "@tabler/icons-react";
import { basename } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { courseErrorMessage } from "./errors";
import type { CourseSourceInput, StoredCourse } from "./model";
import { importCourse, type ImportProgress } from "./storage";

export default function ImportCourseModal({
  libraryDir,
  opened,
  onClose,
  onImported,
}: {
  libraryDir: string;
  opened: boolean;
  onClose: () => void;
  onImported: (stored: StoredCourse) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sources, setSources] = useState<CourseSourceInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  async function chooseFiles() {
    setPicking(true);
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "PGN", extensions: ["pgn"] }],
      });
      if (!selected) return;
      const paths = typeof selected === "string" ? [selected] : selected;
      const fresh = await Promise.all(
        paths
          .filter((path) => !sources.some((source) => source.path === path))
          .map(async (path): Promise<CourseSourceInput> => {
            const name = await basename(path);
            return { path, name, topic: name.replace(/\.pgn$/i, ""), side: "auto" };
          }),
      );
      setSources((previous) => [...previous, ...fresh]);
      if (!title && sources.length === 0 && fresh.length) setTitle(fresh[0].topic.slice(0, 160));
      setError("");
    } catch (cause) {
      setError(courseErrorMessage(cause, t));
    } finally {
      setPicking(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const stored = await importCourse({
        libraryDir,
        title,
        description,
        sources,
        onProgress: setProgress,
      });
      await onImported(stored);
      onClose();
    } catch (cause) {
      setError(courseErrorMessage(cause, t));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function updateSource(index: number, change: Partial<CourseSourceInput>) {
    setSources((previous) =>
      previous.map((source, i) => (i === index ? { ...source, ...change } : source)),
    );
  }

  return (
    <Modal
      opened={opened}
      onClose={() => !busy && !picking && onClose()}
      title={t("Courses.Import.Title")}
      size="lg"
      closeOnClickOutside={!busy && !picking}
      closeOnEscape={!busy && !picking}
      withCloseButton={!busy && !picking}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {t("Courses.Import.Description")}
          </Text>
          <TextInput
            required
            label={t("Courses.Import.Name")}
            maxLength={160}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Textarea
            label={t("Courses.Import.Summary")}
            maxLength={4000}
            autosize
            minRows={2}
            maxRows={4}
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              {t("Courses.Import.Files", { count: sources.length })}
            </Text>
            <Button
              type="button"
              variant="default"
              size="xs"
              leftSection={<IconPlus size={14} />}
              disabled={busy}
              loading={picking}
              onClick={() => void chooseFiles()}
            >
              {t("Courses.Import.AddFiles")}
            </Button>
          </Group>
          <ScrollArea.Autosize mah={320} type="auto">
            <Stack gap="xs">
              {sources.map((source, index) => (
                <Paper key={source.path} withBorder p="sm">
                  <Group wrap="nowrap" justify="space-between" mb="xs">
                    <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
                      {source.name}
                    </Text>
                    <Tooltip label={t("Courses.Import.RemoveFile")}>
                      <ActionIcon
                        type="button"
                        variant="subtle"
                        color="red"
                        disabled={busy}
                        aria-label={t("Courses.Import.RemoveFile")}
                        onClick={() =>
                          setSources((previous) => previous.filter((_, i) => i !== index))
                        }
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Group grow align="start">
                    <TextInput
                      required
                      size="xs"
                      label={t("Courses.Import.Topic")}
                      value={source.topic}
                      disabled={busy}
                      onChange={(event) =>
                        updateSource(index, { topic: event.currentTarget.value })
                      }
                    />
                    <Select
                      size="xs"
                      label={t("Courses.Import.Side")}
                      allowDeselect={false}
                      value={source.side}
                      disabled={busy}
                      data={[
                        { value: "auto", label: t("Courses.Side.Auto") },
                        { value: "white", label: t("Courses.Side.White") },
                        { value: "black", label: t("Courses.Side.Black") },
                      ]}
                      onChange={(value) =>
                        updateSource(index, { side: value as CourseSourceInput["side"] })
                      }
                    />
                  </Group>
                </Paper>
              ))}
              {!sources.length && (
                <Paper withBorder p="lg">
                  <Text size="sm" ta="center" c="dimmed">
                    {t("Courses.Import.ChooseFiles")}
                  </Text>
                </Paper>
              )}
            </Stack>
          </ScrollArea.Autosize>
          <Text size="xs" c="dimmed">
            {t("Courses.Import.TopicHelp")}
          </Text>
          {progress && (
            <Stack gap={4}>
              <Text size="xs" role="status">
                {t("Courses.Import.Progress", progress)}
              </Text>
              <Progress value={(progress.game / progress.total) * 100} animated />
            </Stack>
          )}
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            loading={busy}
            disabled={picking || !sources.length || !title.trim()}
            leftSection={<IconFileImport size={16} />}
          >
            {t("Courses.Import.Create")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
