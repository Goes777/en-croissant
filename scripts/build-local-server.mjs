import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { build } = await import(
  pathToFileURL(createRequire(require.resolve("vite")).resolve("rolldown")).href
);
const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  input: resolve(root, "scripts/serve-pwa.mjs"),
  platform: "node",
  external: [/^node:/],
  output: { file: resolve(root, "server-dist/serve-pwa.mjs"), format: "esm", codeSplitting: false },
});
