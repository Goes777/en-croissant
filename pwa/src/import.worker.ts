import { proposeLegacyCourse, proposePgnExercises } from "@/domain/exercises/pgn";
import { proposeDesktopMigration } from "@/infrastructure/db/legacyMigration";

self.onmessage = async (
    event: MessageEvent<{
        text: string;
        sourceKey: string;
        courseTitle: string;
        mode: "moves" | "concept";
        legacy: boolean;
    }>,
) => {
    try {
        const { text, sourceKey, courseTitle, mode, legacy } = event.data;
        const parsed = legacy ? JSON.parse(text) : null;
        const proposal = legacy
            ? parsed.format === "chesspratica-migration"
                ? await proposeDesktopMigration(parsed)
                : await proposeLegacyCourse(parsed)
            : await proposePgnExercises(text, sourceKey, courseTitle, mode);
        self.postMessage({ proposal });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
