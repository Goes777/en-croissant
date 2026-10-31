import { useTrainingDb } from "./TrainingDbContext";
import {
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  createTheme,
  Group,
  MantineProvider,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconBook,
  IconChessKnight,
  IconCalendar,
  IconHistory,
  IconUpload,
  IconSettings,
} from "@tabler/icons-react";
import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import {
  type Exercise,
  type ExerciseAttempt,
  type ReviewEvent,
  type SrsExerciseCard,
  isMoveExercise,
} from "@/domain/exercises/model";
import { introductoryExercises } from "@/domain/exercises/seeds";
import {
  confirmReconciliation,
  exportBackup,
  reconcileExercises,
  reviewQueue,
} from "@/infrastructure/db/TrainingDatabase";
import { TrainingSession } from "./TrainingSession";
import { ImportPanel } from "./ImportPanel";
import { StudyPanel } from "./StudyPanel";
import { download, exportCourse, exportPgn } from "./io";
import { observedStatistics } from "@/domain/exercises/statistics";
import { loadBundledModules, installBundledModule } from "./bundledModules";
import { ModuleOverview } from "./ModuleOverview";

type Snapshot = {
  exercises: Exercise[];
  cards: SrsExerciseCard[];
  attempts: ExerciseAttempt[];
  events: ReviewEvent[];
  legacy: { key: string; value: unknown }[];
};
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const theme = createTheme({
  primaryColor: "teal",
  fontFamily: "system-ui, sans-serif",
  defaultRadius: "md",
});
const pages = [
  { id: "today", label: "Hoje", icon: IconCalendar },
  { id: "library", label: "Cursos", icon: IconBook },
  { id: "import", label: "Importar", icon: IconUpload },
  { id: "history", label: "Histórico", icon: IconHistory },
  { id: "settings", label: "Ajustes", icon: IconSettings },
];

export function App({
  accountControls,
  accountName,
}: { accountControls?: import("react").ReactNode; accountName?: string } = {}) {
  const trainingDb = useTrainingDb();
  const [bundledExercises, setBundledExercises] = useState<Exercise[]>([]),
    [moduleBusy, setModuleBusy] = useState(false);
  const [page, setPage] = useState("today"),
    [snapshot, setSnapshot] = useState<Snapshot>({
      exercises: [],
      cards: [],
      attempts: [],
      events: [],
      legacy: [],
    }),
    [session, setSession] = useState<{
      exercise: Exercise;
      card: SrsExerciseCard;
      guided?: boolean;
    } | null>(null),
    [study, setStudy] = useState<Exercise | null>(null);
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [offlineReady, setOfflineReady] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [update, setUpdate] = useState(false),
    [refresh, setRefresh] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const [color, setColor] = useState<"light" | "dark">(() => "dark"),
    [boardTheme, setBoardTheme] = useState(() => "classic"),
    [pieces, setPieces] = useState(() => "cburnett"),
    [persisted, setPersisted] = useState(false),
    [search, setSearch] = useState(""),
    [course, setCourse] = useState<string | null>(null),
    [kind, setKind] = useState<string | null>(null),
    [pagination, setPagination] = useState(1),
    [clock, setClock] = useState(() => new Date()),
    [previousFamily, setPreviousFamily] = useState<string>();
  useEffect(() => {
    const subscription = liveQuery(async () => ({
      exercises: await trainingDb.exercises.toArray(),
      cards: await trainingDb.cards.toArray(),
      attempts: await trainingDb.attempts.toArray(),
      events: await trainingDb.events.toArray(),
      legacy: await trainingDb.settings.where("key").startsWith("legacy-").toArray(),
    })).subscribe({ next: setSnapshot, error: (cause) => setError(String(cause)) });
    void (async () => {
      try {
        setBundledExercises((await loadBundledModules()).flatMap((pack) => pack.exercises));
        const preference = await trainingDb.settings.get("ui.preferences");
        if (preference) {
          const value = preference.value as { color?: string; board?: string; pieces?: string };
          if (value.color) setColor(value.color === "light" ? "light" : "dark");
          if (["classic", "wood", "green"].includes(value.board ?? "")) setBoardTheme(value.board!);
          if (["cburnett", "merida"].includes(value.pieces ?? "")) setPieces(value.pieces!);
        }
        setClock(new Date());
        setReady(true);
        setPersisted((await navigator.storage?.persisted?.()) ?? false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    const onlineHandler = () => setOnline(navigator.onLine),
      installHandler = (event: Event) => {
        event.preventDefault();
        setInstall(event as InstallEvent);
      };
    addEventListener("online", onlineHandler);
    addEventListener("offline", onlineHandler);
    addEventListener("beforeinstallprompt", installHandler);
    const interval = setInterval(() => setClock(new Date()), 30_000);
    if ("serviceWorker" in navigator) {
      const updater = registerSW({
        onOfflineReady: () => setOfflineReady(true),
        onNeedRefresh: () => setUpdate(true),
        onRegisterError: (cause) => setError("O cache offline não foi concluído: " + String(cause)),
      });
      // The service-worker updater is an external subscription, registered once.
      // oxlint-disable-next-line react/set-state-in-effect
      setRefresh(() => updater);
      void navigator.serviceWorker.ready.then(() => setOfflineReady(true));
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.active) setOfflineReady(true);
      });
    }
    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      removeEventListener("online", onlineHandler);
      removeEventListener("offline", onlineHandler);
      removeEventListener("beforeinstallprompt", installHandler);
    };
  }, [trainingDb]);
  useEffect(() => {
    if (ready)
      void trainingDb.settings
        .put({ key: "ui.preferences", value: { color, board: boardTheme, pieces } })
        .catch((cause) => setError(String(cause)));
  }, [ready, color, boardTheme, pieces, trainingDb]);
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = import.meta.env.BASE_URL + `pieces/${pieces}.css`;
    document.head.append(link);
    return () => link.remove();
  }, [pieces]);
  const queue = useMemo(
    () => reviewQueue(snapshot.exercises, snapshot.cards, clock, previousFamily),
    [snapshot, clock, previousFamily],
  );
  const courses = [...new Set(snapshot.exercises.map((x) => x.courseTitle))].sort();
  const [stage, setStage] = useState<string | null>(null),
    [trainingType, setTrainingType] = useState<string | null>(null),
    [lessonRole, setLessonRole] = useState<string | null>("exercise");
  const moduleLessons = snapshot.exercises.filter(
    (exercise) => !course || exercise.courseTitle === course,
  );
  const stages = [
    ...new Set(moduleLessons.flatMap((exercise) => (exercise.stage ? [exercise.stage] : []))),
  ].sort((a, b) => Number(a) - Number(b));
  const trainingTypes = [
    ...new Set(
      moduleLessons.flatMap((exercise) => (exercise.trainingType ? [exercise.trainingType] : [])),
    ),
  ].sort();
  const filtered = snapshot.exercises
    .filter(
      (exercise) =>
        (!course || exercise.courseTitle === course) &&
        (!stage || exercise.stage === stage) &&
        (!trainingType || exercise.trainingType === trainingType) &&
        (!lessonRole || (exercise.lessonRole ?? "exercise") === lessonRole) &&
        (!kind || (kind === "tactic" ? isMoveExercise(exercise) : !isMoveExercise(exercise))) &&
        `${exercise.title} ${exercise.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.courseTitle.localeCompare(b.courseTitle) || a.order - b.order);
  const attempts = [...snapshot.attempts].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const automatic = attempts.filter((attempt) => attempt.correctness !== "ungraded"),
    autonomous = automatic.filter(
      (attempt) => attempt.correctness === "correct" && !attempt.hintsUsed && !attempt.errors,
    );
  const overdue = queue.filter(
    (card) =>
      card.fsrsCard.reps > 0 &&
      card.dueAt < new Date(clock.getFullYear(), clock.getMonth(), clock.getDate()).toISOString(),
  ).length;
  const observed = observedStatistics(snapshot.exercises, attempts, clock);
  const nextDue = snapshot.cards
    .filter((card) => !card.suspended && card.dueAt > clock.toISOString())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  function navigate(id: string) {
    // Navigation-event timestamp, never invoked during render.
    // oxlint-disable-next-line react/purity
    setClock(new Date());
    setPage(id);
    setSession(null);
    setStudy(null);
  }
  function start(card: SrsExerciseCard, guided = false) {
    const exercise = snapshot.exercises.find((x) => x.id === card.exerciseId);
    if (exercise) setSession({ exercise, card, guided });
  }
  async function backup() {
    try {
      download(
        "ChessPratica-backup-" + new Date().toISOString().slice(0, 10) + ".json",
        JSON.stringify(await exportBackup(trainingDb)),
      );
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function addIntroduction() {
    try {
      await reconcileExercises(
        trainingDb,
        introductoryExercises,
        introductoryExercises.flatMap((exercise) =>
          exercise.sourceAnchorIds.map((id) => ({
            id,
            sourceKey: "original:chesspratica",
            label: "Conteúdo autoral ChessPratica · " + exercise.title,
          })),
        ),
      );
      setClock(new Date());
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function openModule(title: string) {
    setModuleBusy(true);
    try {
      await installBundledModule(trainingDb, title);
      setCourse(title);
      setKind(null);
      setStage(null);
      setTrainingType(null);
      setSearch("");
      setPagination(1);
      setLessonRole("exercise");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setModuleBusy(false);
    }
  }
  return (
    <MantineProvider theme={theme} forceColorScheme={color}>
      <AppShell
        header={{ height: 76 }}
        navbar={{ width: 190, breakpoint: "sm", collapsed: { mobile: true } }}
        padding="md"
      >
        <AppShell.Header>
          <Group
            className="app-header-layout"
            h="100%"
            px="lg"
            justify="space-between"
            wrap="nowrap"
          >
            <Group gap="xs">
              <IconChessKnight size={34} />
              <div>
                <Title order={1} size="h3">
                  ChessPratica
                </Title>
                <Text size="xs" c="dimmed">
                  Estude. Entenda. Pratique.
                </Text>
              </div>
            </Group>
            <Group gap="xs">
              {accountControls}
              <Badge color={offlineReady ? "green" : "gray"} variant="light">
                {offlineReady
                  ? "Disponível offline"
                  : online
                    ? "Preparando modo offline"
                    : "Sem rede"}
              </Badge>
              {install && (
                <Button size="xs" onClick={() => void install.prompt()}>
                  Instalar
                </Button>
              )}
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="sm">
          <Stack gap="xs" className="desktop-navigation">
            {pages.map((item) => (
              <Button
                key={item.id}
                justify="start"
                leftSection={<item.icon size={19} />}
                variant={page === item.id ? "light" : "subtle"}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          <Text size="xs" c="dimmed" mt="auto">
            {accountName ? `Conta: ${accountName}` : "Perfil sem conta"}
            <br />
            v0.17.0
          </Text>
        </AppShell.Navbar>
        <AppShell.Main>
          <Container size="xl" pb={88}>
            {error && (
              <Alert color="red" mb="md" withCloseButton onClose={() => setError("")}>
                {error}
              </Alert>
            )}
            {update && (
              <Alert mb="md" title="Atualização pronta">
                <Button size="xs" onClick={() => void refresh?.(true)} disabled={!!session}>
                  Aplicar atualização
                </Button>
                <Text size="xs">Finalize o treino antes de atualizar.</Text>
              </Alert>
            )}
            {!ready ? (
              <Text>Preparando a biblioteca local…</Text>
            ) : session ? (
              <TrainingSession
                key={session.exercise.id + session.card.fsrsCard.reps}
                exercise={session.exercise}
                card={session.card}
                boardTheme={boardTheme}
                onClose={() => setSession(null)}
                onSaved={() => {
                  setPreviousFamily(session.exercise.exerciseFamilyId);
                  const next = session.guided
                    ? filtered.find(
                        (exercise) =>
                          exercise.courseTitle === session.exercise.courseTitle &&
                          exercise.lessonRole !== "example" &&
                          exercise.order > session.exercise.order,
                      )
                    : undefined;
                  const nextCard = next
                    ? snapshot.cards.find((card) => card.exerciseId === next.id && !card.suspended)
                    : undefined;
                  setSession(
                    next && nextCard ? { exercise: next, card: nextCard, guided: true } : null,
                  );
                  // Timestamp of the completed rating event.
                  // oxlint-disable-next-line react/purity
                  setClock(new Date());
                }}
              />
            ) : study ? (
              <StudyPanel exercise={study} theme={boardTheme} onClose={() => setStudy(null)} />
            ) : (
              <>
                {page === "today" && (
                  <Stack gap="lg">
                    {!snapshot.exercises.some((exercise) =>
                      exercise.id.startsWith("chesspratica-intro:"),
                    ) && (
                      <Alert title="Comece por um curso guiado">
                        <Text>
                          20 exercícios autorais: 10 de tática e técnica e 10 de estratégia, com
                          soluções comentadas.
                        </Text>
                        <Button mt="sm" onClick={() => void addIntroduction()}>
                          Adicionar fundamentos guiados
                        </Button>
                      </Alert>
                    )}
                    <div>
                      <Text c="dimmed">Seu estudo de hoje</Text>
                      <Title order={2}>Uma posição de cada vez.</Title>
                      <Text c="dimmed" mt="xs">
                        Tática com gabarito explícito. Estratégia com planos e justificativas.
                      </Text>
                    </div>
                    <SimpleGrid cols={{ base: 2, md: 4 }}>
                      {[
                        ["Para hoje", queue.length],
                        ["Atrasados", overdue],
                        ["Revisões salvas", snapshot.events.length],
                        ["Acertos autônomos", autonomous.length],
                      ].map(([label, value]) => (
                        <Card key={label} withBorder>
                          <Text c="dimmed" size="sm">
                            {label}
                          </Text>
                          <Title order={2}>{value}</Title>
                        </Card>
                      ))}
                    </SimpleGrid>
                    <Card withBorder>
                      <Group justify="space-between">
                        <Stack gap="xs">
                          <Title order={3}>
                            {queue.length ? "Sua próxima revisão" : "Tudo em dia"}
                          </Title>
                          <Text>
                            {queue.length
                              ? snapshot.exercises.find((x) => x.id === queue[0].exerciseId)?.title
                              : nextDue
                                ? `Próxima revisão: ${new Date(nextDue.dueAt).toLocaleString("pt-BR")}`
                                : "Importe um curso ou explore os fundamentos guiados."}
                          </Text>
                          <Text size="sm" c="dimmed">
                            A agenda intercala famílias de exercícios. O FSRS estima memória; não
                            certifica compreensão estratégica.
                          </Text>
                        </Stack>
                        <Button size="lg" disabled={!queue.length} onClick={() => start(queue[0])}>
                          Começar revisão
                        </Button>
                      </Group>
                    </Card>
                    <SimpleGrid cols={{ base: 1, md: 2 }}>
                      <Card withBorder>
                        <Title order={3}>Tática e técnica</Title>
                        <Text mt="sm">
                          Mate, garfo, cravada, defesa, promoção e sequências no tabuleiro.
                        </Text>
                        <Button
                          variant="light"
                          mt="md"
                          onClick={() => {
                            setKind("tactic");
                            navigate("library");
                          }}
                        >
                          Explorar tática
                        </Button>
                      </Card>
                      <Card withBorder>
                        <Title order={3}>Estratégia com sentido</Title>
                        <Text mt="sm">
                          Compare planos, organize etapas e explique ideias com rubricas.
                        </Text>
                        <Button
                          variant="light"
                          mt="md"
                          onClick={() => {
                            setKind("strategy");
                            navigate("library");
                          }}
                        >
                          Explorar estratégia
                        </Button>
                      </Card>
                    </SimpleGrid>
                  </Stack>
                )}
                {page === "library" && (
                  <Stack>
                    <Group justify="space-between">
                      <Title order={2}>Cursos e exercícios</Title>
                      <Group>
                        <Button
                          variant="default"
                          onClick={() =>
                            void exportCourse(
                              trainingDb,
                              snapshot.exercises.filter((x) => !course || x.courseTitle === course),
                            ).catch((cause) => setError(String(cause)))
                          }
                        >
                          Exportar curso JSON
                        </Button>
                        <Button
                          variant="default"
                          onClick={() => {
                            try {
                              exportPgn(
                                snapshot.exercises.filter(
                                  (x) => !course || x.courseTitle === course,
                                ),
                              );
                            } catch (cause) {
                              setError(String(cause));
                            }
                          }}
                        >
                          Exportar PGN
                        </Button>
                        <Button onClick={() => navigate("import")}>Importar curso</Button>
                      </Group>
                    </Group>
                    {!course && !search && (
                      <ModuleOverview
                        exercises={[
                          ...new Map(
                            [...bundledExercises, ...snapshot.exercises].map((exercise) => [
                              exercise.id,
                              exercise,
                            ]),
                          ).values(),
                        ]}
                        attempts={snapshot.attempts}
                        onSelect={(title) => void openModule(title)}
                        busy={moduleBusy}
                      />
                    )}
                    <Group grow>
                      <TextInput
                        label="Pesquisar"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.currentTarget.value);
                          setPagination(1);
                        }}
                      />
                      <Select
                        label="Curso"
                        clearable
                        placeholder="Todos"
                        data={courses}
                        value={course}
                        onChange={(value) => {
                          setCourse(value);
                          setStage(null);
                          setTrainingType(null);
                          setPagination(1);
                        }}
                      />
                      <Select
                        label="Tipo"
                        clearable
                        placeholder="Todos"
                        data={[
                          { value: "tactic", label: "Tática / técnica" },
                          { value: "strategy", label: "Estratégia" },
                        ]}
                        value={kind}
                        onChange={(value) => {
                          setKind(value);
                          setPagination(1);
                        }}
                      />
                    </Group>
                    {(stages.length > 0 || trainingTypes.length > 0) && (
                      <Group grow>
                        <Select
                          label="Etapa"
                          placeholder="Todas"
                          clearable
                          data={stages.map((value) => ({ value, label: "Etapa " + value }))}
                          value={stage}
                          onChange={(value) => {
                            setStage(value);
                            setPagination(1);
                          }}
                        />
                        <Select
                          label="Tipo de treino"
                          placeholder="Todos os temas"
                          clearable
                          searchable
                          data={trainingTypes}
                          value={trainingType}
                          onChange={(value) => {
                            setTrainingType(value);
                            setPagination(1);
                          }}
                        />
                        <Select
                          label="Conteúdo"
                          clearable
                          placeholder="Exercícios e exemplos"
                          data={[
                            { value: "exercise", label: "Exercícios" },
                            { value: "example", label: "Exemplos didáticos" },
                          ]}
                          value={lessonRole}
                          onChange={(value) => {
                            setLessonRole(value);
                            setPagination(1);
                          }}
                        />
                      </Group>
                    )}
                    <Text size="sm" c="dimmed">
                      {filtered.length}{" "}
                      {lessonRole === "example" ? "exemplos didáticos" : "exercícios"} · vários
                      temas por curso
                    </Text>
                    <SimpleGrid cols={{ base: 1, lg: 2 }}>
                      {filtered.slice((pagination - 1) * 20, pagination * 20).map((exercise) => {
                        const card = snapshot.cards.find((x) => x.exerciseId === exercise.id);
                        return (
                          <Card withBorder key={exercise.id}>
                            <Stack gap="xs">
                              <Group justify="space-between">
                                <Badge variant="light">
                                  {exercise.lessonRole === "example"
                                    ? "Exemplo didático"
                                    : isMoveExercise(exercise)
                                      ? "Tática / técnica"
                                      : "Estratégia"}
                                </Badge>
                                <Text size="xs" c="dimmed">
                                  v{exercise.version}
                                </Text>
                              </Group>
                              <Title order={3} size="h4">
                                {exercise.title}
                              </Title>
                              <Text size="sm" c="dimmed">
                                {exercise.courseTitle} · {exercise.tags.join(" / ")}
                                {exercise.stage ? " · Etapa " + exercise.stage : ""}
                              </Text>
                              <Group>
                                {exercise.lessonRole !== "example" && (
                                  <Button
                                    size="sm"
                                    disabled={
                                      !card || card.suspended || exercise.status !== "validated"
                                    }
                                    onClick={() => card && start(card, !!exercise.trainingType)}
                                  >
                                    Treinar
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => setStudy(exercise)}
                                >
                                  Estudar solução
                                </Button>
                              </Group>
                              {card?.needsReconciliation && (
                                <Alert color="orange">
                                  <Text size="sm">
                                    O gabarito mudou. As revisões anteriores estão preservadas.
                                    Confira a nova solução antes de retomar.
                                  </Text>
                                  <Button
                                    size="xs"
                                    mt="xs"
                                    onClick={() =>
                                      void confirmReconciliation(trainingDb, exercise.id).catch(
                                        (cause) => setError(String(cause)),
                                      )
                                    }
                                  >
                                    Conferi o novo gabarito; reiniciar agenda
                                  </Button>
                                </Alert>
                              )}
                            </Stack>
                          </Card>
                        );
                      })}
                    </SimpleGrid>
                    {filtered.length > 20 && (
                      <Pagination
                        total={Math.ceil(filtered.length / 20)}
                        value={pagination}
                        onChange={setPagination}
                      />
                    )}
                  </Stack>
                )}
                {page === "import" && (
                  <ImportPanel
                    onImported={() => {
                      setClock(new Date());
                      setPage((current) => (current === "import" ? "library" : current));
                    }}
                  />
                )}
                {page === "history" && (
                  <Stack>
                    <Title order={2}>Histórico e progresso</Title>
                    {snapshot.legacy.length > 0 && (
                      <Alert title="Dados do aplicativo anterior preservados">
                        <Text>
                          {snapshot.legacy.filter((x) => x.key.startsWith("legacy-review:")).length}{" "}
                          registros de revisão anteriores e{" "}
                          {snapshot.legacy.filter((x) => x.key.startsWith("legacy-course:")).length}{" "}
                          cursos com progresso manual. Os cartões mantêm a agenda original. O
                          histórico anterior permanece no backup sem inventar tentativas, dicas ou
                          tempos que não foram registrados.
                        </Text>
                        <details>
                          <summary>Consultar os registros anteriores</summary>
                          {snapshot.legacy.slice(0, 100).map((item) => (
                            <Text size="sm" key={item.key}>
                              {legacySummary(item)}
                            </Text>
                          ))}
                        </details>
                      </Alert>
                    )}
                    <Text>
                      As tentativas e os eventos de revisão permanecem salvos após edições e
                      reimportações.
                    </Text>
                    <SimpleGrid cols={{ base: 2, md: 4 }}>
                      {[
                        ["Tentativas", attempts.length],
                        [
                          "Acertos em respostas automáticas",
                          automatic.length
                            ? Math.round(
                                (automatic.filter((x) => x.correctness === "correct").length /
                                  automatic.length) *
                                  100,
                              ) + "%"
                            : "—",
                        ],
                        [
                          "Autoavaliações guiadas",
                          attempts.filter((x) => x.correctness === "ungraded").length,
                        ],
                        [
                          "Tempo total",
                          Math.round(attempts.reduce((sum, x) => sum + x.elapsedMs, 0) / 60000) +
                            " min",
                        ],
                      ].map(([label, value]) => (
                        <Card withBorder key={label}>
                          <Text size="sm">{label}</Text>
                          <Title order={3}>{value}</Title>
                        </Card>
                      ))}
                    </SimpleGrid>
                    <Card withBorder>
                      <Text>
                        Acertos autônomos na primeira tentativa de cada exercício no dia: últimos 7
                        dias{" "}
                        {observed.recent.independentRate === null
                          ? "sem dados"
                          : observed.recent.independentRate + "%"}{" "}
                        ({observed.recent.attempts} tentativas); 7 dias anteriores{" "}
                        {observed.previous.independentRate === null
                          ? "sem dados"
                          : observed.previous.independentRate + "%"}{" "}
                        ({observed.previous.attempts} tentativas).
                      </Text>
                      <Text size="sm" c="dimmed">
                        {observed.distinctPositions} posições distintas · {observed.families}{" "}
                        famílias praticadas. Autoavaliações abertas aparecem separadamente.
                      </Text>
                    </Card>
                    <Table.ScrollContainer minWidth={600}>
                      <Table aria-label="Resultados por tema">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Tema</Table.Th>
                            <Table.Th>Tentativas</Table.Th>
                            <Table.Th>Acerto observado</Table.Th>
                            <Table.Th>Com ajuda / erro</Table.Th>
                            <Table.Th>Tempo médio</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {observed.themes.map((row) => (
                            <Table.Tr key={row.theme}>
                              <Table.Td>{row.theme}</Table.Td>
                              <Table.Td>{row.attempts}</Table.Td>
                              <Table.Td>
                                {row.automatic
                                  ? Math.round((100 * row.correct) / row.automatic) + "%"
                                  : "Autoavaliação"}
                              </Table.Td>
                              <Table.Td>{row.helped}</Table.Td>
                              <Table.Td>
                                {Math.round(row.elapsedMs / row.attempts / 1000)} s
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                    <Text size="sm" c="dimmed">
                      Resultados repetidos da mesma posição refletem prática e memória.
                      Transferência para posições relacionadas precisa ser observada separadamente.
                    </Text>
                    <Table.ScrollContainer minWidth={620}>
                      <Table aria-label="Histórico de tentativas">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Quando</Table.Th>
                            <Table.Th>Exercício</Table.Th>
                            <Table.Th>Resultado</Table.Th>
                            <Table.Th>Dicas / erros</Table.Th>
                            <Table.Th>Tempo</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {attempts.slice(0, 100).map((attempt) => (
                            <Table.Tr key={attempt.id}>
                              <Table.Td>
                                {new Date(attempt.finishedAt).toLocaleString("pt-BR")}
                              </Table.Td>
                              <Table.Td>
                                {snapshot.exercises.find((x) => x.id === attempt.exerciseId)?.title}{" "}
                                · v{attempt.exerciseVersion}
                              </Table.Td>
                              <Table.Td>
                                {
                                  {
                                    correct: "Correto",
                                    partial: "Parcial",
                                    incorrect: "Incorreto",
                                    ungraded: "Autoavaliação",
                                  }[attempt.correctness]
                                }
                              </Table.Td>
                              <Table.Td>
                                {attempt.hintsUsed} / {attempt.errors}
                              </Table.Td>
                              <Table.Td>{Math.round(attempt.elapsedMs / 1000)} s</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                    {!attempts.length && <Text>Nenhuma revisão concluída ainda.</Text>}
                  </Stack>
                )}
                {page === "settings" && (
                  <Stack maw={750}>
                    <Title order={2}>Seu ChessPratica</Title>
                    <Select
                      label="Aparência"
                      value={color}
                      onChange={(value) => setColor(value === "light" ? "light" : "dark")}
                      data={[
                        { value: "dark", label: "Escuro" },
                        { value: "light", label: "Claro" },
                      ]}
                    />
                    <Select
                      label="Tabuleiro"
                      value={boardTheme}
                      onChange={(value) => setBoardTheme(value ?? "classic")}
                      data={[
                        { value: "classic", label: "Clássico" },
                        { value: "wood", label: "Madeira" },
                        { value: "green", label: "Verde" },
                      ]}
                    />
                    <Select
                      label="Peças"
                      value={pieces}
                      onChange={(value) => setPieces(value ?? "cburnett")}
                      data={[
                        { value: "cburnett", label: "Clássicas (Cburnett)" },
                        { value: "merida", label: "Merida" },
                      ]}
                    />
                    <Card withBorder>
                      <Title order={3}>Backup completo</Title>
                      <Text mt="sm">
                        Inclui exercícios, fontes PGN, cartões, versões, tentativas e histórico
                        FSRS. Exportar apenas um PGN ou curso não substitui este backup.
                      </Text>
                      <Group mt="md">
                        <Button onClick={() => void backup()}>Salvar backup completo</Button>
                        <Button variant="default" onClick={() => navigate("import")}>
                          Restaurar backup
                        </Button>
                      </Group>
                    </Card>
                    <Card withBorder>
                      <Title order={3}>Armazenamento e privacidade</Title>
                      <Text mt="sm">
                        Contas locais neste computador. Sem telemetria ou envio de arquivos. Os
                        dados ficam neste navegador/dispositivo. Faça backup antes de trocar de
                        aparelho ou limpar os dados do navegador.
                      </Text>
                      <Text mt="xs" size="sm">
                        Armazenamento persistente:{" "}
                        {persisted ? "autorizado" : "ainda não autorizado pelo navegador"}.
                      </Text>
                      <Button
                        mt="md"
                        variant="light"
                        onClick={() => void navigator.storage?.persist?.().then(setPersisted)}
                      >
                        Solicitar armazenamento persistente
                      </Button>
                    </Card>
                    <Text size="sm" c="dimmed">
                      Baseado em En Croissant e Chessground. GPL-3.0. Motor Stockfish 19.0.1 local;
                      agendador ts-fsrs 3.5.1. O aplicativo desktop anterior e seus arquivos
                      permanecem intactos. Para trazer seus dados, importe um PGN, course.json ou
                      ChessPratica-migracao.json em Importar.
                    </Text>
                    <a
                      href={import.meta.env.BASE_URL + "THIRD-PARTY-LICENSES.txt"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Licenças e avisos dos componentes
                    </a>
                  </Stack>
                )}
              </>
            )}
          </Container>
        </AppShell.Main>
        <nav className="mobile-navigation" aria-label="Navegação principal">
          {pages.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "selected" : ""}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </AppShell>
    </MantineProvider>
  );
}

function legacySummary(item: { key: string; value: unknown }) {
  const value = item.value as {
    title?: string;
    lessons?: number;
    progress?: { completed?: Record<string, unknown> };
    review?: string;
    rating?: number;
    fen?: string;
  };
  if (item.key.startsWith("legacy-course:"))
    return `${value.title ?? "Curso anterior"}: ${Object.keys(value.progress?.completed ?? {}).length} de ${value.lessons ?? 0} lições concluídas.`;
  const date = value.review
    ? new Date(value.review).toLocaleString("pt-BR")
    : "Data não registrada";
  return `${date} · avaliação ${value.rating ?? "não registrada"}${value.fen ? " · posição " + value.fen : ""}`;
}
