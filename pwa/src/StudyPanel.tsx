import { useTrainingDb } from "./TrainingDbContext";
import {
  Alert,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { parsePgn, startingPosition, parseComment } from "chessops/pgn";
import { parseSan } from "chessops/san";
import { makeFen } from "chessops/fen";
import { type Exercise, type SourceAnchor, isMoveExercise } from "@/domain/exercises/model";
import { proposePgnExercises } from "@/domain/exercises/pgn";
import { coursePgn } from "@/domain/exercises/exportPgn";
import { TrainingBoard } from "./Board";
import { validateExercise } from "@/domain/exercises/grader";
import { reconcileExercises } from "@/infrastructure/db/TrainingDatabase";

export function StudyPanel({
  exercise,
  theme,
  onClose,
}: {
  exercise: Exercise;
  theme: string;
  onClose: () => void;
}) {
  const trainingDb = useTrainingDb();
  const [view, setView] = useState(exercise),
    [fenDraft, setFenDraft] = useState(exercise.startFen),
    [lines, setLines] = useState(
      exercise.acceptedLinesUci.map((line) => line.join(" ")).join("\n"),
    ),
    [source, setSource] = useState(exercise.sourcePgn ?? ""),
    [goal, setGoal] = useState(exercise.goal),
    [anchors, setAnchors] = useState<SourceAnchor[]>([]);
  useEffect(() => {
    void trainingDb.anchors
      .bulkGet(exercise.sourceAnchorIds)
      .then((items) => setAnchors(items.filter((item) => !!item)));
  }, [exercise.sourceAnchorIds, trainingDb]);
  const [step, setStep] = useState(0),
    [branch, setBranch] = useState<number[]>([]),
    [editing, setEditing] = useState(false),
    [prompt, setPrompt] = useState(exercise.prompt),
    [explanation, setExplanation] = useState(exercise.explanation),
    [notice, setNotice] = useState("");
  const state = useMemo(() => {
    const game = parsePgn(coursePgn([view]))[0];
    const position = startingPosition(game.headers).unwrap();
    let node = game.moves,
      comments = game.comments ?? [];
    let reached = 0;
    for (let i = 0; i < step; i++) {
      const child =
        branch[i] === undefined
          ? node.children.find((child) => child.data.san !== "--")
          : node.children[branch[i]];
      if (!child) break;
      const move = parseSan(position, child.data.san);
      if (!move) break;
      position.play(move);
      comments = child.data.comments ?? [];
      node = child;
      reached++;
    }
    return {
      fen: makeFen(position.toSetup()),
      comments: [
        ...comments,
        ...node.children
          .filter((child) => child.data.san === "--")
          .flatMap((child) => child.data.comments ?? []),
      ],
      choices: node.children
        .map((child, index) => ({
          value: String(index),
          label:
            child.data.san +
            (child.data.nags?.some((nag) => [2, 4, 6].includes(nag)) ? " ? · linha de erro" : ""),
        }))
        .filter((_, index) => node.children[index].data.san !== "--"),
      max: reached,
    };
  }, [view, step, branch]);
  async function save() {
    try {
      let startFen = fenDraft,
        acceptedLinesUci = lines
          .split("\n")
          .map((line) => line.trim().split(/\s+/))
          .filter((line) => line[0]);
      if (source.trim() && source !== view.sourcePgn) {
        const proposal = await proposePgnExercises(
          source,
          view.studyChapterId ?? view.id,
          view.courseTitle,
        );
        if (proposal.exercises.length !== 1 || proposal.issues.length)
          throw new Error("A edição deve conter exatamente uma partida válida.");
        startFen = proposal.exercises[0].startFen;
        acceptedLinesUci = proposal.exercises[0].acceptedLinesUci;
      }
      const updated = validateExercise({
        ...view,
        prompt,
        explanation,
        startFen,
        acceptedLinesUci,
        goal,
        sourcePgn: source || undefined,
      });
      await reconcileExercises(trainingDb, [updated]);
      setView((await trainingDb.exercises.get(view.id))!);
      setStep(0);
      setBranch([]);
      setEditing(false);
      setNotice(
        "Edição salva. O histórico foi preservado; alterações no gabarito pausam o cartão para reconciliação.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <Stack>
      <Button variant="subtle" onClick={onClose} w="fit-content">
        Voltar à biblioteca
      </Button>
      <Title order={2}>{view.title}</Title>
      <div className="lesson-layout">
        <div>
          <TrainingBoard fen={state.fen} theme={theme} annotations={state.comments} />
          <Group mt="sm">
            <Button variant="default" onClick={() => setStep(0)}>
              Início
            </Button>
            <Button
              variant="default"
              disabled={!step}
              onClick={() => setStep((value) => value - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="default"
              disabled={!state.choices.length}
              onClick={() => setStep((value) => value + 1)}
            >
              Próximo lance
            </Button>
          </Group>
          {state.choices.length > 1 && (
            <Select
              label="Variante a seguir"
              value={String(branch[step] ?? state.choices[0]?.value ?? 0)}
              data={state.choices}
              onChange={(value) =>
                setBranch((current) => [...current.slice(0, step), Number(value)])
              }
            />
          )}
        </div>
        <Stack>
          <Text>{view.prompt}</Text>
          {view.sourceNotes?.map((note) => (
            <Text key={note} size="sm" c="dimmed">
              {note}
            </Text>
          ))}
          {state.comments.map((comment, index) => (
            <Text key={index} className="readable">
              {parseComment(comment).text}
            </Text>
          ))}
          {state.comments
            .map((comment) => parseComment(comment).text)
            .filter(Boolean)
            .join("\n") !== view.explanation && (
            <Text className="readable">{view.explanation}</Text>
          )}
          {anchors.map((anchor) => (
            <Text key={anchor.id} size="sm" c="dimmed">
              Fonte: {anchor.label}
              {anchor.page ? ` · página ${anchor.page}` : ""}
              {anchor.excerpt ? ` · ${anchor.excerpt}` : ""}
            </Text>
          ))}
          <Button variant="light" onClick={() => setEditing((value) => !value)}>
            Editar lição e gabarito
          </Button>
          {editing && (
            <>
              <Textarea
                label="Pergunta"
                value={prompt}
                onChange={(event) => setPrompt(event.currentTarget.value)}
              />
              <Textarea
                label="Explicação"
                minRows={5}
                value={explanation}
                onChange={(event) => setExplanation(event.currentTarget.value)}
              />
              <TextInput
                label="Posição FEN"
                value={fenDraft}
                onChange={(event) => setFenDraft(event.currentTarget.value)}
              />
              {isMoveExercise(view) && (
                <>
                  <Textarea
                    label="Linhas aceitas por coordenadas"
                    description="Uma alternativa por linha. Inclua as réplicas: e2e4 e7e5 g1f3."
                    value={lines}
                    onChange={(event) => setLines(event.currentTarget.value)}
                  />
                  <Select
                    label="Objetivo da solução"
                    value={goal}
                    data={[
                      { value: "line", label: "Completar a continuação" },
                      { value: "checkmate", label: "Confirmar xeque-mate" },
                    ]}
                    onChange={(value) => setGoal(value === "checkmate" ? "checkmate" : "line")}
                  />
                </>
              )}
              <Textarea
                label="PGN da lição"
                description="Se alterar o PGN, a posição e as continuações serão lidas dele, preservando comentários e variantes."
                minRows={6}
                value={source}
                onChange={(event) => setSource(event.currentTarget.value)}
              />
              <Button onClick={() => void save()}>Salvar edição</Button>
            </>
          )}
          {view.sourcePgn && (
            <details>
              <summary>PGN desta lição, com comentários e variantes</summary>
              <pre className="readable pgn-source">{view.sourcePgn}</pre>
            </details>
          )}
          {notice && <Alert>{notice}</Alert>}
        </Stack>
      </div>
    </Stack>
  );
}
