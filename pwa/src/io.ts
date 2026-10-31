import { exerciseSchema, type Exercise } from "@/domain/exercises/model";
import { validateExercise } from "@/domain/exercises/grader";
import { z } from "zod";
import type { TrainingDatabase } from "@/infrastructure/db/TrainingDatabase";
import { coursePgn } from "@/domain/exercises/exportPgn";

export function exportPgn(exercises: Exercise[]) {
    download("ChessPratica-curso.pgn", coursePgn(exercises), "application/x-chess-pgn");
}

export function download(name: string, content: string, mime = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const anchorSchema = z.object({
    id: z.string(),
    sourceKey: z.string(),
    label: z.string(),
    page: z.number().int().positive().optional(),
    excerpt: z.string().optional(),
    fingerprint: z.string().optional(),
});
export const packageSchema = z.object({
    format: z.literal("chesspratica-course"),
    version: z.literal(1),
    exercises: z.array(exerciseSchema).min(1),
    anchors: z.array(anchorSchema).default([]),
});
export function parsePackage(input: unknown) {
    const pack = packageSchema.parse(input);
    pack.exercises.forEach(validateExercise);
    const anchors = new Set(pack.anchors.map((x) => x.id));
    if (pack.exercises.some((exercise) => exercise.sourceAnchorIds.some((id) => !anchors.has(id))))
        throw new Error("O curso não contém todas as referências de origem.");
    return pack;
}
export async function exportCourse(trainingDb: TrainingDatabase, exercises: Exercise[]) {
    const anchors = (
        await trainingDb.anchors.bulkGet([...new Set(exercises.flatMap((x) => x.sourceAnchorIds))])
    ).filter((x) => !!x);
    const pack = parsePackage({ format: "chesspratica-course", version: 1, exercises, anchors });
    download("ChessPratica-curso.json", JSON.stringify(pack, null, 2));
}
