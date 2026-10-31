import { z } from "zod";
import { packageSchema, parsePackage } from "./io";
import { reconcileExercises, type TrainingDatabase } from "@/infrastructure/db/TrainingDatabase";

// Optional personal course files. Empty in a public source checkout.
const urls = Object.values(
    import.meta.glob<string>("../../local-courses/*.json", {
        eager: true,
        query: "?url",
        import: "default",
    }),
);
const moduleSchema = packageSchema.extend({
    module: z.object({ id: z.string(), title: z.string(), fingerprint: z.string() }),
    originals: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
});
let catalog: Promise<z.infer<typeof moduleSchema>[]> | undefined;
export function loadBundledModules() {
    return (catalog ??= Promise.all(
        urls.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Não foi possível carregar o módulo local.");
            return moduleSchema.parse(await response.json());
        }),
    ));
}
export async function installBundledModule(trainingDb: TrainingDatabase, title: string) {
    for (const pack of await loadBundledModules()) {
        if (pack.module.title !== title) continue;
        const key = "installed-module:" + pack.module.id;
        if ((await trainingDb.settings.get(key))?.value === pack.module.fingerprint) continue;
        parsePackage(pack);
        await trainingDb.transaction("rw", trainingDb.tables, async () => {
            if ((await trainingDb.settings.get(key))?.value === pack.module.fingerprint) return;
            await reconcileExercises(trainingDb, pack.exercises, pack.anchors);
            await trainingDb.settings.put({
                key: "module-sources:" + pack.module.id,
                value: pack.originals,
            });
            await trainingDb.settings.put({ key, value: pack.module.fingerprint });
        });
    }
}
