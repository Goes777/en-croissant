import type { Exercise, ExerciseAttempt } from "./model";

export function observedStatistics(
    exercises: Exercise[],
    attempts: ExerciseAttempt[],
    now = new Date(),
) {
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const themes = new Map<
        string,
        {
            theme: string;
            attempts: number;
            automatic: number;
            correct: number;
            independent: number;
            helped: number;
            elapsedMs: number;
        }
    >();
    const firstDaily = new Map<string, ExerciseAttempt>();
    for (const attempt of [...attempts].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))) {
        const dailyKey = attempt.exerciseId + ":" + attempt.finishedAt.slice(0, 10);
        if (!firstDaily.has(dailyKey)) firstDaily.set(dailyKey, attempt);
        for (const tag of byId.get(attempt.exerciseId)?.tags ?? ["Sem tema"]) {
            const row = themes.get(tag) ?? {
                theme: tag,
                attempts: 0,
                automatic: 0,
                correct: 0,
                independent: 0,
                helped: 0,
                elapsedMs: 0,
            };
            row.attempts++;
            row.elapsedMs += attempt.elapsedMs;
            if (attempt.correctness !== "ungraded") {
                row.automatic++;
                if (attempt.correctness === "correct") row.correct++;
            }
            if (attempt.correctness === "correct" && !attempt.hintsUsed && !attempt.errors)
                row.independent++;
            if (attempt.hintsUsed || attempt.errors) row.helped++;
            themes.set(tag, row);
        }
    }
    const recentStart = now.getTime() - 7 * 86400000,
        previousStart = now.getTime() - 14 * 86400000;
    const recent = [...firstDaily.values()].filter((x) => Date.parse(x.finishedAt) >= recentStart),
        previous = [...firstDaily.values()].filter(
            (x) =>
                Date.parse(x.finishedAt) >= previousStart && Date.parse(x.finishedAt) < recentStart,
        );
    const independentRate = (list: ExerciseAttempt[]) => {
        const graded = list.filter((x) => x.correctness !== "ungraded");
        return graded.length
            ? Math.round(
                  (100 *
                      graded.filter((x) => x.correctness === "correct" && !x.hintsUsed && !x.errors)
                          .length) /
                      graded.length,
              )
            : null;
    };
    return {
        themes: [...themes.values()].sort((a, b) => a.theme.localeCompare(b.theme)),
        recent: { attempts: recent.length, independentRate: independentRate(recent) },
        previous: { attempts: previous.length, independentRate: independentRate(previous) },
        distinctPositions: new Set(
            attempts.map(
                (x) =>
                    byId.get(x.exerciseId)?.startFen.split(" ").slice(0, 4).join(" ") ??
                    x.exerciseId,
            ),
        ).size,
        families: new Set(
            attempts.map((x) => byId.get(x.exerciseId)?.exerciseFamilyId ?? x.exerciseId),
        ).size,
    };
}
