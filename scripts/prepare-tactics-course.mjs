// Converts explicitly supplied local PGNs; output is gitignored personal material.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const [exercisePath, examplePath] = process.argv.slice(2);
if (!exercisePath)
  throw new Error("Uso: node scripts/prepare-tactics-course.mjs exercicios.pgn [exemplos.pgn]");
const originals = [
  { name: "Exercícios originais.pgn", text: await readFile(resolve(exercisePath), "utf8") },
  ...(examplePath
    ? [
        {
          name: "Exemplos didáticos originais.pgn",
          text: await readFile(resolve(examplePath), "utf8"),
        },
      ]
    : []),
];
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": resolve(root, "src") } },
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { proposePgnExercises } = await server.ssrLoadModule("/src/domain/exercises/pgn.ts");
  const proposals = [];
  for (const item of originals)
    proposals.push(await proposePgnExercises(item.text, item.name, "Táticas Iniciante"));
  const issues = proposals.flatMap((proposal) => proposal.issues);
  if (issues.length) throw new Error(JSON.stringify(issues, null, 2));
  const exercises = proposals
    .flatMap((proposal) => proposal.exercises)
    .map((exercise) => ({ ...exercise, status: "validated" }));
  const tasks = exercises
    .filter((exercise) => exercise.lessonRole !== "example")
    .sort((a, b) => a.order - b.order);
  for (const example of exercises.filter((exercise) => exercise.lessonRole === "example")) {
    const next = tasks.find((task) => task.order > example.order) ?? tasks.at(-1);
    if (next) {
      example.stage = next.stage;
      example.trainingType = next.trainingType;
      example.tags = next.tags;
      example.difficultyLabel = next.difficultyLabel;
    }
  }
  const anchors = proposals.flatMap((proposal) => proposal.anchors);
  if (new Set(exercises.map((exercise) => exercise.id)).size !== exercises.length)
    throw new Error("Fontes com registros duplicados.");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ exercises, originals }))
    .digest("hex");
  const pack = {
    format: "chesspratica-course",
    version: 1,
    module: { id: "taticas-iniciante", title: "Táticas Iniciante", fingerprint },
    exercises,
    anchors,
    originals,
  };
  const output = resolve(root, "local-courses/taticas-iniciante.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(pack));
  console.log(
    JSON.stringify(
      {
        output,
        exercises: tasks.length,
        examples: exercises.length - tasks.length,
        themes: new Set(tasks.map((x) => x.trainingType)).size,
        stages: new Set(tasks.map((x) => x.stage)).size,
        mates: tasks.filter((x) => x.goal === "checkmate").length,
        fingerprint,
        bytes: Buffer.byteLength(JSON.stringify(pack)),
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
