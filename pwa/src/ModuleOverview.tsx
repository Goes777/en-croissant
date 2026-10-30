import {
  Badge,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { Exercise, ExerciseAttempt } from "@/domain/exercises/model";

export function ModuleOverview({
  exercises,
  attempts,
  onSelect,
  busy = false,
}: {
  exercises: Exercise[];
  attempts: ExerciseAttempt[];
  onSelect: (title: string) => void;
  busy?: boolean;
}) {
  const practiced = new Set(attempts.map((attempt) => attempt.exerciseId));
  const modules = [...new Set(exercises.map((exercise) => exercise.courseTitle))];
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      {modules.map((title) => {
        const lessons = exercises.filter((exercise) => exercise.courseTitle === title),
          tasks = lessons.filter((exercise) => exercise.lessonRole !== "example");
        const done = tasks.filter((exercise) => practiced.has(exercise.id)).length;
        const themes = new Set(
          tasks.flatMap((exercise) =>
            exercise.trainingType ? [exercise.trainingType] : exercise.tags,
          ),
        ).size;
        const stages = new Set(
          tasks.flatMap((exercise) => (exercise.stage ? [exercise.stage] : [])),
        ).size;
        return (
          <Card key={title} withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Badge>Módulo</Badge>
                <Text size="sm" c="dimmed">
                  {done} / {tasks.length} praticados
                </Text>
              </Group>
              <Title order={3}>{title}</Title>
              <Text size="sm">
                {tasks.length} exercícios · {themes} tipos de treino
                {stages ? ` · ${stages} etapas` : ""}
                {lessons.length > tasks.length
                  ? ` · ${lessons.length - tasks.length} exemplos didáticos`
                  : ""}
              </Text>
              <Progress
                value={tasks.length ? (100 * done) / tasks.length : 0}
                aria-label={`Progresso de ${title}`}
              />
              <Button
                loading={busy}
                onClick={() => onSelect(title)}
                aria-label={`Abrir módulo ${title}`}
              >
                Abrir módulo
              </Button>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
