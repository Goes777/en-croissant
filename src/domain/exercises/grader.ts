import { Chess, normalizeMove } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { makeUci, parseUci } from "chessops";
import {
    type Correctness,
    type Exercise,
    exerciseSchema,
    isMoveExercise,
    type Rating,
} from "./model";

export function positionFromExercise(fen: string) {
    const setup = parseFen(fen);
    if (setup.isErr) throw new Error("FEN inválida.");
    const position = Chess.fromSetup(setup.unwrap());
    if (position.isErr) throw new Error("Posição de xadrez inválida.");
    return position.unwrap();
}
export function validateExercise(input: unknown): Exercise {
    const exercise = exerciseSchema.parse(input);
    const start = positionFromExercise(exercise.startFen);
    if (new Set(exercise.options.map((x) => x.id)).size !== exercise.options.length)
        throw new Error("Alternativas com IDs repetidos.");
    if (isMoveExercise(exercise)) {
        if (!exercise.acceptedLinesUci.length)
            throw new Error("O exercício precisa de uma solução explícita.");
        for (const line of exercise.acceptedLinesUci) {
            const position = start.clone();
            for (const [index, uci] of line.entries()) {
                const move = parseUci(uci);
                if (!move || !position.isLegal(move)) throw new Error(`Lance ilegal: ${uci}`);
                line[index] = makeUci(normalizeMove(position, move));
                position.play(move);
            }
            if (
                exercise.goal === "checkmate" &&
                (!position.isCheckmate() || position.outcome()?.winner !== start.turn)
            )
                throw new Error(
                    "A solução anunciada como mate não termina em xeque-mate a favor do aluno.",
                );
        }
    } else if (["strategy-plan-mcq", "strategy-plan-order"].includes(exercise.kind)) {
        if (
            !exercise.acceptedAnswerIds.length ||
            exercise.acceptedAnswerIds.some((id) => !exercise.options.some((x) => x.id === id))
        )
            throw new Error("Faltam alternativas corretas e justificadas.");
        if (
            exercise.kind === "strategy-plan-order" &&
            exercise.acceptedAnswerIds.length !== exercise.options.length
        )
            throw new Error("A ordem precisa conter todas as etapas.");
    } else if (!exercise.rubric.length)
        throw new Error("Respostas abertas precisam de uma rubrica de autoavaliação.");
    return exercise;
}
const prefix = (line: string[], played: string[]) =>
    played.every((move, index) => line[index] === move);

export function playTrainingMove(exercise: Exercise, played: string[], uci: string) {
    const position = positionFromExercise(exercise.startFen);
    for (const previous of played) {
        const move = parseUci(previous);
        if (!move || !position.isLegal(move)) throw new Error("Sequência da tentativa inválida.");
        position.play(move);
    }
    const move = parseUci(uci);
    if (!move || !position.isLegal(move))
        return {
            accepted: false,
            legal: false,
            played,
            fen: makeFen(position.toSetup()),
            complete: false,
        };
    const canonical = makeUci(normalizeMove(position, move));
    const next = [...played, canonical];
    const candidates = exercise.acceptedLinesUci.filter((line) => prefix(line, next));
    if (!candidates.length)
        return {
            accepted: false,
            legal: true,
            played,
            fen: makeFen(position.toSetup()),
            complete: false,
        };
    position.play(move);
    if (!candidates.some((line) => line.length === next.length)) {
        const reply = candidates[0][next.length];
        const response = parseUci(reply);
        if (!response || !position.isLegal(response))
            throw new Error("Réplica inválida no gabarito.");
        position.play(response);
        next.push(reply);
    }
    return {
        accepted: true,
        legal: true,
        played: next,
        fen: makeFen(position.toSetup()),
        complete: exercise.acceptedLinesUci.some(
            (line) => line.length === next.length && prefix(line, next),
        ),
    };
}

export function gradeAttempt(
    exercise: Exercise,
    input: { moves?: string[]; answers?: string[]; explanation?: string },
): { correctness: Correctness; feedback: string } {
    if (isMoveExercise(exercise)) {
        const played = [...(input.moves ?? [])];
        const position = positionFromExercise(exercise.startFen);
        for (const [index, uci] of played.entries()) {
            const move = parseUci(uci);
            if (!move || !position.isLegal(move))
                return {
                    correctness: "incorrect",
                    feedback: "A tentativa contém um lance ilegal.",
                };
            played[index] = makeUci(normalizeMove(position, move));
            position.play(move);
        }
        const exact = exercise.acceptedLinesUci.some(
            (line) => line.length === played.length && prefix(line, played),
        );
        if (exact) return { correctness: "correct", feedback: exercise.explanation };
        return {
            correctness:
                played.length && exercise.acceptedLinesUci.some((line) => prefix(line, played))
                    ? "partial"
                    : "incorrect",
            feedback: played.length
                ? "A sequência ainda não corresponde a uma solução completa validada."
                : "Nenhuma sequência foi resolvida.",
        };
    }
    if (exercise.kind === "strategy-plan-mcq") {
        const answers = [...new Set(input.answers ?? [])];
        const correct =
            answers.length === exercise.acceptedAnswerIds.length &&
            answers.every((id) => exercise.acceptedAnswerIds.includes(id));
        return {
            correctness: correct
                ? "correct"
                : answers.length && answers.every((id) => exercise.acceptedAnswerIds.includes(id))
                  ? "partial"
                  : "incorrect",
            feedback: exercise.explanation,
        };
    }
    if (exercise.kind === "strategy-plan-order") {
        const correct =
            JSON.stringify(input.answers ?? []) === JSON.stringify(exercise.acceptedAnswerIds);
        return { correctness: correct ? "correct" : "incorrect", feedback: exercise.explanation };
    }
    return {
        correctness: "ungraded",
        feedback:
            "Compare sua resposta com a rubrica. A correção é uma autoavaliação guiada; o programa não infere compreensão pelo texto digitado.",
    };
}
export function suggestedRating(
    correctness: Correctness,
    hintsUsed: number,
    errors: number,
    selfAssessment?: Correctness,
): Rating {
    const result = correctness === "ungraded" ? selfAssessment : correctness;
    if (!result || result === "incorrect" || result === "partial" || errors > 0) return 1;
    return hintsUsed > 0 ? 2 : 3;
}
