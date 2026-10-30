import {
    emptyHeaders,
    makePgn,
    PgnParser,
    startingPosition,
    type Game,
    type PgnNodeData,
    parseComment,
} from "chessops/pgn";
import { makeFen } from "chessops/fen";
import { parseSquare } from "chessops";
import { inspectCourseSource, inspectCourseGame, courseSchema } from "@/components/courses/model";
import { type Exercise, type SourceAnchor, type SrsExerciseCard, stableId } from "./model";
import { validateExercise } from "./grader";
import { solutionLines } from "./pgnSolution";

export type ImportProposal = {
    exercises: Exercise[];
    anchors: SourceAnchor[];
    issues: { game: number; message: string }[];
    sourceKey: string;
    originalText: string;
    legacyCards?: SrsExerciseCard[];
    migrationSettings?: { key: string; value: unknown }[];
};
export async function proposePgnExercises(
    text: string,
    sourceKey: string,
    courseTitle: string,
    mode: "moves" | "concept" = "moves",
): Promise<ImportProposal> {
    if (new TextEncoder().encode(text).length > 20_000_000)
        throw new Error("Cada PGN pode ter até 20 MB.");
    inspectCourseSource(text);
    const games: Game<PgnNodeData>[] = [];
    new PgnParser((game) => games.push(game), emptyHeaders, 5_000_000).parse(text);
    const result: ImportProposal = {
        exercises: [],
        anchors: [],
        issues: [],
        sourceKey,
        originalText: text,
    };
    for (const [index, game] of games.entries()) {
        try {
            const pgn = makePgn(game),
                summary = inspectCourseGame(pgn, { allowTerminalNullMoves: true });
            const initial = startingPosition(game.headers).unwrap();
            const trainingType = game.headers.get("TrainingType") ?? summary.topic;
            const mate = !!trainingType && /^Mate em [12](?:\b|\s)/i.test(trainingType);
            const { lines, terminalMarkers, refutations } = solutionLines(game, mate);
            const sourceRecord = game.headers.get("SourceRecord"),
                sourceCollection = game.headers.get("Event") ?? sourceKey;
            const identity = sourceRecord
                ? `${courseTitle}:${sourceCollection}:${sourceRecord}`
                : sourceKey + ":" + index;
            const anchorId = await stableId(identity);
            const white = game.headers.get("White") ?? "",
                example = /^Example\s+\d+/i.test(white);
            const exerciseNumber = /^(?:Exercício|Exercise|Example)\s+(\d+)/i.exec(white)?.[1];
            const comments = [
                ...(game.comments ?? []),
                ...Array.from(game.moves.mainline()).flatMap((node) => node.comments ?? []),
            ]
                .map((comment) => parseComment(comment).text)
                .filter(Boolean)
                .join("\n");
            const concept = mode === "concept" || !lines.length;
            if (
                mode === "moves" &&
                !lines.length &&
                summary.mainlineMoves > terminalMarkers &&
                !example
            )
                throw new Error(
                    "Nenhuma solução confiável restou após excluir as variantes de erro.",
                );
            const topic = trainingType || game.headers.get("ChessimoModule") || "PGN";
            const origin = lines[0]?.[0]?.slice(0, 2),
                role = origin ? initial.board.get(parseSquare(origin)!)?.role : undefined;
            const pieceNames = {
                pawn: "peão",
                knight: "cavalo",
                bishop: "bispo",
                rook: "torre",
                queen: "dama",
                king: "rei",
            };
            const prompt = example
                ? "Estude a posição, as anotações e as variantes do exemplo original."
                : mate
                  ? `Encontre o ${trainingType!.split(" / ")[0].toLowerCase()}.`
                  : /^Empate$/i.test(topic)
                    ? "Encontre a continuação que consegue o empate."
                    : /^Ganho/i.test(topic)
                      ? `Encontre a continuação para ${topic.split(" / ").at(-1)!.toLowerCase()}.`
                      : /^Sacrifício/i.test(topic)
                        ? `Encontre a combinação de ${topic.toLowerCase()}.`
                        : "Encontre a melhor continuação prevista na solução do exercício.";
            const exercise = validateExercise({
                id: await stableId("exercise:" + anchorId + ":" + mode),
                kind: concept ? "strategy-explain" : "tactic-sequence",
                title: exerciseNumber
                    ? `${example ? "Exemplo didático" : "Exercício"} ${exerciseNumber}${trainingType ? " · " + trainingType : ""}`
                    : summary.title || `Exercício ${index + 1}`,
                prompt: example
                    ? prompt
                    : concept
                      ? "Descreva o plano da posição e justifique sua escolha usando as notas do estudo."
                      : prompt,
                startFen: makeFen(initial.toSetup()),
                acceptedLinesUci: concept ? [] : lines,
                explanation:
                    comments ||
                    (trainingType
                        ? `Objetivo: ${trainingType}. Compare a continuação com as respostas e variantes do material original.`
                        : "A solução corresponde às continuações explícitas deste PGN. Acrescente uma explicação pedagógica antes de publicar o exercício."),
                hints: trainingType
                    ? [
                          mate
                              ? "Observe os xeques e verifique quais casas de fuga o rei ainda tem."
                              : /^Empate$/i.test(topic)
                                ? "Procure recursos defensivos, afogamento e possibilidades de repetição."
                                : "Observe as peças sem defesa e as combinações de ataque.",
                          ...(role
                              ? [`A solução começa com um lance de ${pieceNames[role]}.`]
                              : []),
                      ]
                    : [],
                tags: [...new Set(topic.split(" / "))],
                courseTitle,
                rubric: concept
                    ? [
                          {
                              criterion: "Plano e evidência",
                              explanation:
                                  comments ||
                                  "Explique o plano e compare com as notas originais. Revise o gabarito antes de publicar.",
                          },
                      ]
                    : [],
                sourceAnchorIds: [anchorId],
                studyChapterId: identity,
                sourcePgn: pgn,
                status: "needs-review",
                version: 1,
                exerciseFamilyId: trainingType
                    ? sourceCollection + ":" + trainingType
                    : sourceKey + ":" + index,
                order: sourceRecord && /^\d+$/.test(sourceRecord) ? Number(sourceRecord) : index,
                goal: mate && !concept ? "checkmate" : "line",
                trainingType,
                stage: game.headers.get("Stage"),
                sourceRecord,
                sourceCollection,
                exerciseNumber: exerciseNumber ? Number(exerciseNumber) : undefined,
                lessonRole: example ? "example" : "exercise",
                difficultyLabel: game.headers.get("Stage")
                    ? "Etapa " + game.headers.get("Stage")
                    : undefined,
                sourceNotes: [
                    ...(terminalMarkers
                        ? [
                              "O marcador didático -- encerra a linha na fonte; não é um lance jogável.",
                          ]
                        : []),
                    ...(refutations
                        ? [
                              "As variantes marcadas como erro estão disponíveis no estudo e não são aceitas como solução.",
                          ]
                        : []),
                ],
            });
            result.exercises.push(exercise);
            result.anchors.push({
                id: anchorId,
                sourceKey,
                label: `${sourceKey} · partida ${index + 1}`,
            });
        } catch (error) {
            result.issues.push({
                game: index + 1,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return result;
}

export async function proposeLegacyCourse(input: unknown): Promise<ImportProposal> {
    const course = courseSchema.parse(input);
    const result: ImportProposal = {
        exercises: [],
        anchors: [],
        issues: [],
        sourceKey: "desktop-course:" + course.id,
        originalText: JSON.stringify(input),
    };
    for (const [index, lesson] of course.lessons.entries()) {
        const proposal = await proposePgnExercises(
            lesson.pgn,
            `desktop-course:${course.id}:${lesson.id}`,
            course.title,
        );
        result.exercises.push(
            ...proposal.exercises.map((exercise) => ({
                ...exercise,
                title: lesson.title,
                tags: [lesson.topic],
                studyChapterId: lesson.id,
                order: index,
            })),
        );
        result.anchors.push(...proposal.anchors);
        result.issues.push(...proposal.issues.map((issue) => ({ ...issue, game: index + 1 })));
    }
    return result;
}
export const coursePackageSchemaVersion = 1;
