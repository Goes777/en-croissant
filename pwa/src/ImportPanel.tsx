import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import type { ImportProposal } from "@/domain/exercises/pgn";
import { stableId } from "@/domain/exercises/model";
import {
  backupSchema,
  reconcileExercises,
  restoreBackup,
  trainingDb,
} from "@/infrastructure/db/TrainingDatabase";
import { parsePackage } from "./io";
import { validateExercise } from "@/domain/exercises/grader";

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([]),
    [title, setTitle] = useState("Meu curso"),
    [mode, setMode] = useState<string | null>("moves"),
    [text, setText] = useState("");
  const [proposals, setProposals] = useState<ImportProposal[]>([]),
    [backup, setBackup] = useState<unknown>(null),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null),
    cancelled = useRef(false);
  const [newTitle, setNewTitle] = useState("Meu exercício"),
    [newFen, setNewFen] = useState(""),
    [newSolution, setNewSolution] = useState(""),
    [newPrompt, setNewPrompt] = useState(""),
    [newExplanation, setNewExplanation] = useState(""),
    [newRubric, setNewRubric] = useState("");
  useEffect(() => () => worker.current?.terminate(), []);
  function cancel() {
    cancelled.current = true;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setError("Importação cancelada. Nenhum dado foi publicado.");
  }
  function fromWorker(content: string, sourceKey: string, legacy: boolean) {
    return new Promise<ImportProposal>((resolve, reject) => {
      const current = new Worker(new URL("./import.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = current;
      current.onmessage = (event) => {
        current.terminate();
        worker.current = null;
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.proposal);
      };
      current.onerror = () => {
        current.terminate();
        reject(new Error("Não foi possível analisar o arquivo local."));
      };
      current.postMessage({
        text: content,
        sourceKey,
        courseTitle: title,
        mode: mode ?? "moves",
        legacy,
      });
    });
  }
  async function inspect() {
    setBusy(true);
    cancelled.current = false;
    setError("");
    setProposals([]);
    setBackup(null);
    setApproved(false);
    try {
      const inputs = files.length
        ? await Promise.all(
            files.map(async (file) => {
              if (file.size > (file.name.toLowerCase().endsWith(".pgn") ? 20_000_000 : 100_000_000))
                throw new Error("Limite: 20 MB por PGN e 100 MB por JSON.");
              return { name: file.name, text: await file.text() };
            }),
          )
        : [{ name: title + ".pgn", text }];
      const result: ImportProposal[] = [];
      for (const item of inputs) {
        if (cancelled.current) return;
        if (item.text.trim().startsWith("{")) {
          const data = JSON.parse(item.text);
          if (data.format === "chesspratica-migration") {
            result.push(await fromWorker(item.text, item.name, true));
            continue;
          }
          if (data.format === "chesspratica-backup") {
            if (inputs.length !== 1) throw new Error("Restaure um backup completo de cada vez.");
            backupSchema.parse(data);
            setBackup(data);
            continue;
          }
          if (data.format === "chesspratica-course") {
            const pack = parsePackage(data);
            result.push({
              exercises: pack.exercises,
              anchors: pack.anchors,
              issues: [],
              sourceKey: item.name,
              originalText: item.text,
            });
            continue;
          }
          if (data.sources && data.lessons) {
            result.push(await fromWorker(item.text, item.name, true));
            continue;
          }
          throw new Error(
            "JSON não reconhecido. Use um curso, backup ChessPratica ou course.json do aplicativo anterior.",
          );
        }
        const previous = await trainingDb.settings.get(
          "source:" + (await stableId(title + ":" + item.text)),
        );
        const sourceKey =
          (previous?.value as { sourceKey?: string } | undefined)?.sourceKey ??
          title + ":" + item.name;
        result.push(await fromWorker(item.text, sourceKey, false));
      }
      if (!cancelled.current) setProposals(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!cancelled.current) setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      if (backup) await restoreBackup(trainingDb, backup);
      else {
        const archived = await Promise.all(
          proposals.map(async (proposal) => ({
            key:
              "source:" +
              (await stableId(
                (proposal.exercises[0]?.courseTitle ?? title) + ":" + proposal.originalText,
              )),
            value: { sourceKey: proposal.sourceKey, text: proposal.originalText },
          })),
        );
        await trainingDb.transaction("rw", trainingDb.tables, async () => {
          for (const proposal of proposals) {
            await reconcileExercises(
              trainingDb,
              proposal.exercises.map((exercise) => ({ ...exercise, status: "validated" })),
              proposal.anchors,
            );
            for (const incoming of proposal.legacyCards ?? []) {
              const existing = await trainingDb.cards.get(incoming.id);
              if (existing?.needsReconciliation) continue;
              if (
                existing?.fsrsCard.reps &&
                existing.fsrsCard.last_review &&
                existing.fsrsCard.last_review >= (incoming.fsrsCard.last_review ?? "")
              )
                continue;
              if (
                existing?.fsrsCard.reps &&
                JSON.stringify(existing.fsrsCard) !== JSON.stringify(incoming.fsrsCard)
              )
                throw new Error(
                  "Há dois históricos de revisão divergentes. Nenhum deles foi sobrescrito.",
                );
              const currentExercise = await trainingDb.exercises.get(incoming.exerciseId);
              await trainingDb.cards.put({
                ...incoming,
                activeExerciseVersion: currentExercise!.version,
              });
            }
            for (const item of proposal.migrationSettings ?? []) {
              const previous = await trainingDb.settings.get(item.key);
              if (
                previous &&
                item.key.startsWith("legacy-review:") &&
                JSON.stringify(previous.value) !== JSON.stringify(item.value)
              )
                throw new Error("Um registro histórico legado diverge da cópia atual.");
              await trainingDb.settings.put(item);
            }
          }
          await trainingDb.settings.bulkPut(archived);
        });
      }
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function fromFen() {
    setBusy(true);
    setError("");
    setApproved(false);
    cancelled.current = false;
    try {
      if (!newTitle.trim() || !newPrompt.trim() || !newExplanation.trim())
        throw new Error("Preencha título, pergunta e explicação.");
      if (mode === "moves" && !newSolution.trim())
        throw new Error("Um exercício de lances precisa de uma solução explícita.");
      if (mode === "concept" && !newRubric.trim())
        throw new Error("Informe os critérios da rubrica para a resposta aberta.");
      const solution = newSolution.trim(),
        ending = /(?:\*|1-0|0-1|1\/2-1\/2)$/.test(solution) ? "" : " *";
      const pgn = `[Event ${JSON.stringify(newTitle)}]\n[SetUp "1"]\n[FEN ${JSON.stringify(newFen.trim())}]\n\n${solution || "*"}${solution ? ending : ""}`;
      const proposal = await fromWorker(
        pgn,
        `autoria:${title}:` + (await stableId(newTitle + ":" + newFen)),
        false,
      );
      if (proposal.issues.length || proposal.exercises.length !== 1)
        throw new Error(proposal.issues[0]?.message ?? "Não foi possível criar o exercício.");
      proposal.exercises = proposal.exercises.map((exercise) =>
        validateExercise({
          ...exercise,
          prompt: newPrompt,
          explanation: newExplanation,
          ...(mode === "concept"
            ? {
                rubric: newRubric
                  .split("\n")
                  .filter((line) => line.trim())
                  .map((line) => ({ criterion: line.trim(), explanation: line.trim() })),
              }
            : {}),
        }),
      );
      proposal.anchors = proposal.anchors.map((anchor) => ({
        ...anchor,
        label: "Autoria local · " + newTitle,
      }));
      setProposals([proposal]);
      setBackup(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  const legacyCount = proposals.reduce((sum, p) => sum + (p.migrationSettings?.length ?? 0), 0);
  const count = proposals.reduce((sum, p) => sum + p.exercises.length, 0),
    issues = proposals.flatMap((p) => p.issues.map((issue) => ({ ...issue, source: p.sourceKey })));
  return (
    <Stack maw={900}>
      <Title order={2}>Importar curso ou backup</Title>
      <Text>
        Escolha arquivos locais. Nada é enviado a um servidor. Um curso pode reunir vários temas e
        PGNs.
      </Text>
      <TextInput
        label="Nome do curso / contexto da importação"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      <Select
        label="Tipo de exercício criado a partir do PGN"
        value={mode}
        onChange={setMode}
        data={[
          { value: "moves", label: "Lances e sequências explícitas" },
          { value: "concept", label: "Explicação estratégica com revisão humana" },
        ]}
      />
      <FileInput
        label="Arquivos PGN, cursos JSON ou backup"
        accept=".pgn,.json"
        multiple
        clearable
        value={files}
        onChange={setFiles}
      />
      {!files.length && (
        <Textarea
          label="Ou cole um PGN com FEN e solução"
          minRows={6}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder={'[Event "Meu exercício"]\n[FEN "…"]\n\n1. …'}
        />
      )}
      <details>
        <summary>Criar exercício a partir de uma posição FEN</summary>
        <Stack mt="md">
          <TextInput
            label="Nome do exercício"
            value={newTitle}
            onChange={(event) => setNewTitle(event.currentTarget.value)}
          />
          <TextInput
            label="FEN da posição"
            value={newFen}
            onChange={(event) => setNewFen(event.currentTarget.value)}
          />
          <Textarea
            label="Pergunta do exercício"
            value={newPrompt}
            onChange={(event) => setNewPrompt(event.currentTarget.value)}
          />
          <Textarea
            label="Solução em SAN (para exercícios de lances)"
            description="Ex.: 1. Qg7#. As variantes entre parênteses também serão validadas."
            value={newSolution}
            onChange={(event) => setNewSolution(event.currentTarget.value)}
          />
          <Textarea
            label="Explicação da solução"
            value={newExplanation}
            onChange={(event) => setNewExplanation(event.currentTarget.value)}
          />
          {mode === "concept" && (
            <Textarea
              label="Critérios de autoavaliação, um por linha"
              value={newRubric}
              onChange={(event) => setNewRubric(event.currentTarget.value)}
            />
          )}
          <Button disabled={busy} onClick={() => void fromFen()}>
            Preparar exercício da posição
          </Button>
        </Stack>
      </details>
      <Group>
        <Button disabled={busy || (!files.length && !text.trim())} onClick={() => void inspect()}>
          Analisar arquivos
        </Button>
        {busy && (
          <>
            <Loader size="sm" />
            <Button variant="default" onClick={cancel}>
              Cancelar análise
            </Button>
          </>
        )}
      </Group>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {(!!count || !!legacyCount) && (
        <>
          <Group>
            <Badge color="green">{count} exercícios com estrutura e lances válidos</Badge>
            <Badge color={issues.length ? "orange" : "gray"}>
              {issues.length} itens para revisão
            </Badge>
          </Group>
          {!!legacyCount && (
            <Text size="sm">
              {legacyCount} registros legados serão preservados, junto com a agenda dos cartões
              importados.
            </Text>
          )}
          <Text size="sm">
            A verificação de legalidade não substitui a revisão do objetivo e da explicação pelo
            autor. O PGN original e seus comentários serão preservados no backup.
          </Text>
          {proposals
            .flatMap((p) => p.exercises.slice(0, 3))
            .map((exercise) => (
              <Text key={exercise.id} size="sm">
                {exercise.title} · {exercise.tags.join(" / ")}
              </Text>
            ))}
          {issues.length > 0 && (
            <Alert color="orange" title="Estes itens não serão publicados">
              {issues.slice(0, 20).map((issue) => (
                <Text key={issue.source + issue.game} size="sm">
                  {issue.source}, partida {issue.game}: {issue.message}
                </Text>
              ))}
            </Alert>
          )}
          <Checkbox
            checked={approved}
            onChange={(event) => setApproved(event.currentTarget.checked)}
            label={`Revisei o conteúdo e autorizo publicar apenas os ${count} exercícios válidos. Os ${issues.length} itens com problemas permanecem na origem para revisão.`}
          />
          <Button disabled={!approved || busy} loading={busy} onClick={() => void publish()}>
            Publicar curso
          </Button>
        </>
      )}
      {!!backup && (
        <Alert color="blue" title="Prévia do backup">
          <Stack>
            <Text>
              {backupSchema.parse(backup).exercises.length} exercícios e{" "}
              {backupSchema.parse(backup).events.length} revisões. A restauração mescla registros
              idênticos e recusa conflitos; não apaga o histórico atual.
            </Text>
            <Checkbox
              checked={approved}
              onChange={(event) => setApproved(event.currentTarget.checked)}
              label="Confirmo a restauração deste backup neste dispositivo"
            />
            <Button disabled={!approved || busy} onClick={() => void publish()}>
              Restaurar backup
            </Button>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
