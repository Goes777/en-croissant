import { stableId } from "@/domain/exercises/model";
import { exportBackup, restoreBackup, TrainingDatabase } from "./TrainingDatabase";

/** Separate databases ensure that exercise cards and history do not collide. */
export async function profileDatabase(userId: string) {
    if (!userId.trim()) throw new Error("Usuário inválido.");
    return new TrainingDatabase("ChessPraticaProfile-" + (await stableId(userId)));
}

/** Copy, never delete, the legacy library; restoreBackup rejects conflicts atomically. */
export async function copyLegacyProgress(target: TrainingDatabase) {
    const legacy = new TrainingDatabase("ChessPraticaTraining");
    try {
        const backup = await exportBackup(legacy);
        return await restoreBackup(target, backup);
    } finally {
        legacy.close();
    }
}
