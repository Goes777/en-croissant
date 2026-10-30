import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { listCourses } from "./storage";

export async function exportDesktopMigration(documentDir: string) {
    const library = await listCourses(documentDir);
    if (library.warnings.length)
        throw new Error(
            "Há cursos ilegíveis. Resolva os avisos da biblioteca antes de exportar a migração completa.",
        );
    const decks = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("deck-")) continue;
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        if (!value || !Array.isArray(value.positions) || !Array.isArray(value.logs))
            throw new Error("Um histórico de treino não pôde ser lido: " + key);
        decks.push({ key, data: value });
    }
    const path = await save({
        title: "Migrar para o ChessPratica",
        defaultPath: "ChessPratica-migracao.json",
        filters: [{ name: "ChessPratica", extensions: ["json"] }],
    });
    if (!path) return false;
    await writeTextFile(
        path,
        JSON.stringify({
            format: "chesspratica-migration",
            version: 1,
            createdAt: new Date().toISOString(),
            courses: library.courses,
            decks,
        }),
    );
    return true;
}
