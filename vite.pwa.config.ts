import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

export default defineConfig({
    root: resolve(import.meta.dirname, "pwa"),
    base: "./",
    resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
    plugins: [
        react(),
        VitePWA({
            registerType: "prompt",
            injectRegister: "auto",
            strategies: "generateSW",
            manifest: {
                id: "./",
                name: "ChessPratica",
                short_name: "ChessPratica",
                lang: "pt-BR",
                description: "Xadrez offline: cursos, tática, estratégia e revisão FSRS.",
                start_url: "./",
                scope: "./",
                display: "standalone",
                orientation: "any",
                theme_color: "#17251f",
                background_color: "#17251f",
                icons: [
                    { src: "icons/icon-256.png", sizes: "256x256", type: "image/png" },
                    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,png,svg,wasm,txt,json}"],
                maximumFileSizeToCacheInBytes: 8_000_000,
                navigateFallback: "index.html",
                cleanupOutdatedCaches: true,
            },
            devOptions: { enabled: false },
        }),
    ],
    build: {
        outDir: resolve(import.meta.dirname, "dist-pwa"),
        emptyOutDir: true,
        target: "es2022",
        sourcemap: false,
    },
    server: {
        host: "127.0.0.1",
        port: 1430,
        strictPort: true,
        fs: { allow: [import.meta.dirname] },
    },
    preview: { host: "127.0.0.1", port: 1431, strictPort: true },
});
