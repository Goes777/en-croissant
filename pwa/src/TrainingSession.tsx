import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Radio,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import {
  type Exercise,
  type ExerciseAttempt,
  type Rating,
  type SrsExerciseCard,
  isMoveExercise,
} from "@/domain/exercises/model";
import {
  gradeAttempt,
  playTrainingMove,
  positionFromExercise,
  suggestedRating,
} from "@/domain/exercises/grader";
import { fsrsScheduler } from "@/infrastructure/fsrs/FsrsSchedulerAdapter";
import { recordReview, trainingDb } from "@/infrastructure/db/TrainingDatabase";
import { TrainingBoard } from "./Board";
import { LocalEngine } from "./engine";

export function TrainingSession({
  exercise,
  card,
  onSaved,
  onClose,
  boardTheme,
}: {
  exercise: Exercise;
  card: SrsExerciseCard;
  onSaved: () => void;
  onClose: () => void;
  boardTheme: string;
}) {
  const [startedAt] = useState(() => new Date().toISOString()),
    [attemptId] = useState(() => crypto.randomUUID());
  const [fen, setFen] = useState(exercise.startFen),
    [moves, setMoves] = useState<string[]>([]),
    [answers, setAnswers] = useState<string[]>([]),
    [selfExplanation, setSelfExplanation] = useState("");
  const [hints, setHints] = useState(0),
    [errors, setErrors] = useState(0),
    [feedback, setFeedback] = useState(false),
    [notice, setNotice] = useState(""),
    [input, setInput] = useState("");
  const [finishedAt, setFinishedAt] = useState<string | null>(null),
    [submissions, setSubmissions] = useState<NonNullable<ExerciseAttempt["moveSubmissions"]>>([]);
  const [saving, setSaving] = useState(false),
    busy = useRef(false),
    [selfAssessment, setSelfAssessment] = useState<string>("");
  const [analysis, setAnalysis] = useState(""),
    engine = useRef(new LocalEngine());
  useEffect(() => () => engine.current.stop(), []);
  const grade = gradeAttempt(exercise, { moves, answers, explanation: selfExplanation });
  const suggested = suggestedRating(
    grade.correctness,
    hints,
    errors,
    selfAssessment as "correct" | "partial" | "incorrect" | undefined,
  );
  const preview = fsrsScheduler.preview(card.fsrsCard, new Date(finishedAt ?? startedAt));
  const orientation = positionFromExercise(exercise.startFen).turn;
  function move(uci: string) {
    try {
      const result = playTrainingMove(exercise, moves, uci.trim().toLowerCase());
      setSubmissions((current) => [
        ...current,
        {
          uci: uci.trim().toLowerCase(),
          at: new Date().toISOString(),
          fen,
          legal: result.legal,
          accepted: result.accepted,
        },
      ]);
      if (!result.accepted) {
        setErrors((value) => value + 1);
        setNotice(
          result.legal
            ? "Esse lance é legal, mas não pertence às soluções aprovadas. O motor não altera o gabarito."
            : "Esse lance não é legal nesta posição.",
        );
        return;
      }
      setMoves(result.played);
      setFen(result.fen);
      setNotice("");
      setInput("");
      if (result.complete) {
        setFinishedAt(new Date().toISOString());
        setFeedback(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  async function rate(rating: Rating) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setNotice("");
    try {
      // Rating-event timestamp, never invoked during render.
      // oxlint-disable-next-line react/purity
      const endedAt = finishedAt ?? new Date().toISOString();
      await recordReview(
        trainingDb,
        {
          id: attemptId,
          exerciseId: exercise.id,
          exerciseVersion: exercise.version,
          startedAt,
          finishedAt: endedAt,
          moveSubmissions: submissions,
          submittedMovesUci: moves,
          submittedAnswerIds: answers,
          selfExplanation,
          hintsUsed: hints,
          errors,
          elapsedMs: Date.parse(endedAt) - Date.parse(startedAt),
          ...(selfAssessment
            ? { selfAssessment: selfAssessment as "correct" | "partial" | "incorrect" }
            : {}),
        },
        rating,
        card.fsrsCard.reps,
        // oxlint-disable-next-line react/purity
        new Date(),
      );
      onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <Stack>
      <Group justify="space-between">
        <Button variant="subtle" onClick={onClose}>
          Voltar à agenda
        </Button>
        <Badge>{isMoveExercise(exercise) ? "Tática / técnica" : "Estratégia"}</Badge>
      </Group>
      <div className="lesson-layout">
        <div className="board-column">
          <TrainingBoard
            fen={fen}
            orientation={orientation}
            interactive={isMoveExercise(exercise) && !feedback}
            onMove={move}
            theme={boardTheme}
            selectedMove={moves.at(-1)}
          />
          <Text size="sm" c="dimmed" mt="xs">
            {positionFromExercise(fen).turn === "white" ? "Brancas" : "Pretas"} a jogar ·{" "}
            {exercise.tags.join(" · ")}
          </Text>
        </div>
        <Stack className="question-column">
          <div>
            <Text size="sm" c="dimmed">
              {exercise.courseTitle}
            </Text>
            <Title order={2}>{exercise.title}</Title>
          </div>
          <Text className="readable">{exercise.prompt}</Text>
          {!feedback && (
            <>
              {isMoveExercise(exercise) && (
                <Group align="end">
                  <TextInput
                    flex={1}
                    label="Lance por coordenadas"
                    description="Ou mova as peças no tabuleiro. Ex.: e2e4; promoção: a7a8q."
                    value={input}
                    onChange={(event) => setInput(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") move(input);
                    }}
                  />
                  <Button onClick={() => move(input)}>Jogar</Button>
                </Group>
              )}
              {exercise.kind === "strategy-plan-mcq" &&
                exercise.options.map((option) => (
                  <Checkbox
                    key={option.id}
                    label={option.label}
                    checked={answers.includes(option.id)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setAnswers((current) =>
                        checked
                          ? [...current, option.id]
                          : current.filter((id) => id !== option.id),
                      );
                    }}
                  />
                ))}
              {exercise.kind === "strategy-plan-order" && (
                <Stack gap="xs">
                  {(answers.length ? answers : exercise.options.map((x) => x.id).reverse()).map(
                    (id, index, array) => (
                      <Group key={id} wrap="nowrap">
                        <Text flex={1}>
                          {index + 1}. {exercise.options.find((x) => x.id === id)?.label}
                        </Text>
                        <Button
                          size="xs"
                          variant="default"
                          aria-label={`Subir etapa ${index + 1}`}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...array];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            setAnswers(next);
                          }}
                        >
                          ↑
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          aria-label={`Descer etapa ${index + 1}`}
                          disabled={index === array.length - 1}
                          onClick={() => {
                            const next = [...array];
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            setAnswers(next);
                          }}
                        >
                          ↓
                        </Button>
                      </Group>
                    ),
                  )}
                </Stack>
              )}
              {!isMoveExercise(exercise) && (
                <Textarea
                  label="Explique sua ideia"
                  description="Sua explicação será comparada à rubrica; o programa não tenta julgar texto livre por palavras-chave."
                  minRows={3}
                  value={selfExplanation}
                  onChange={(event) => setSelfExplanation(event.currentTarget.value)}
                />
              )}
              {hints > 0 && (
                <Alert title={`Dica ${hints}`}>
                  {exercise.hints.slice(0, hints).map((hint, i) => (
                    <Text key={i}>{hint}</Text>
                  ))}
                </Alert>
              )}
              <Group>
                <Button
                  variant="light"
                  disabled={hints >= exercise.hints.length}
                  onClick={() => setHints((value) => value + 1)}
                >
                  Pedir dica ({hints}/{exercise.hints.length})
                </Button>
                <Button
                  variant={isMoveExercise(exercise) ? "default" : "filled"}
                  onClick={() => {
                    if (exercise.kind === "strategy-plan-order" && !answers.length)
                      setAnswers(exercise.options.map((x) => x.id).reverse());
                    setFinishedAt(new Date().toISOString());
                    setFeedback(true);
                  }}
                >
                  {isMoveExercise(exercise) ? "Ver solução" : "Conferir resposta"}
                </Button>
              </Group>
            </>
          )}
          {feedback && (
            <Card withBorder>
              <Stack gap="sm">
                <Badge
                  color={
                    grade.correctness === "correct"
                      ? "green"
                      : grade.correctness === "ungraded"
                        ? "blue"
                        : "orange"
                  }
                >
                  {
                    {
                      correct: "Resposta correta",
                      partial: "Resposta parcial",
                      incorrect: "Rever a solução",
                      ungraded: "Autoavaliação guiada",
                    }[grade.correctness]
                  }
                </Badge>
                <Text className="readable">{grade.feedback}</Text>
                {grade.correctness !== "correct" && (
                  <Text className="readable">{exercise.explanation}</Text>
                )}
                {exercise.acceptedLinesUci.length > 0 && (
                  <Text size="sm">
                    Continuações aprovadas:{" "}
                    {exercise.acceptedLinesUci.map((line) => line.join(" ")).join(" / ")}
                  </Text>
                )}
                {exercise.options.map((option) => (
                  <Text key={option.id} size="sm">
                    <strong>{option.label}:</strong> {option.explanation}{" "}
                    {exercise.acceptedAnswerIds.includes(option.id) ? "(Gabarito)" : ""}
                  </Text>
                ))}
                {exercise.rubric.map((item) => (
                  <Text key={item.criterion} size="sm">
                    <strong>{item.criterion}:</strong> {item.explanation}
                  </Text>
                ))}
                {grade.correctness === "ungraded" && (
                  <Radio.Group
                    label="Como sua resposta se compara à rubrica?"
                    value={selfAssessment}
                    onChange={setSelfAssessment}
                  >
                    <Stack gap="xs" mt="xs">
                      <Radio value="correct" label="Atendi aos critérios e consigo justificar" />
                      <Radio value="partial" label="Atendi apenas a parte dos critérios" />
                      <Radio value="incorrect" label="Não consegui justificar" />
                    </Stack>
                  </Radio.Group>
                )}
                <Text size="sm" c="dimmed">
                  {hints} dica(s) · {errors} erro(s). Sugestão:{" "}
                  {{ 1: "Novamente", 2: "Difícil", 3: "Bom", 4: "Fácil" }[suggested]}. Você decide a
                  avaliação; rapidez, sozinha, não indica domínio.
                </Text>
                <div className="rating-grid">
                  {preview.map(({ rating, dueAt }) => (
                    <Button
                      key={rating}
                      color={
                        rating === 1
                          ? "red"
                          : rating === 2
                            ? "orange"
                            : rating === 3
                              ? "green"
                              : "blue"
                      }
                      variant={rating === suggested ? "filled" : "light"}
                      loading={saving}
                      disabled={grade.correctness === "ungraded" && !selfAssessment}
                      onClick={() => void rate(rating)}
                      title={new Date(dueAt).toLocaleString("pt-BR")}
                    >
                      {{ 1: "Novamente", 2: "Difícil", 3: "Bom", 4: "Fácil" }[rating]}
                    </Button>
                  ))}
                </div>
                <Button variant="subtle" onClick={() => engine.current.start(fen, setAnalysis)}>
                  Análise complementar local
                </Button>
                {analysis && (
                  <>
                    <Text size="xs" className="readable">
                      {analysis}
                    </Text>
                    <Button variant="subtle" size="xs" onClick={() => engine.current.stop()}>
                      Parar análise
                    </Button>
                  </>
                )}
              </Stack>
            </Card>
          )}
          {notice && (
            <Alert color="orange" role="alert">
              {notice}
            </Alert>
          )}
        </Stack>
      </div>
    </Stack>
  );
}
