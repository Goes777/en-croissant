// Gather the installed runtime dependency notices without changing their text.
import { createRequire } from "node:module";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const queue = [
  "@mantine/core",
  "@mantine/hooks",
  "@tabler/icons-react",
  "react",
  "react-dom",
  "@lichess-org/chessground",
  "chessops",
  "@badrap/result",
  "dexie",
  "ts-fsrs",
  "zod",
  "workbox-window",
  "better-auth",
].map((name) => ({ name, from: join(root, "package.json") }));
queue.push({
  name: "workbox-build",
  from: createRequire(import.meta.url).resolve("vite-plugin-pwa"),
});
const seen = new Set(),
  notices = [];
while (queue.length) {
  const { name, from } = queue.shift();
  const req = createRequire(from);
  let directory;
  try {
    directory = dirname(req.resolve(name + "/package.json"));
  } catch {
    try {
      directory = dirname(req.resolve(name));
      while (directory !== dirname(directory)) {
        try {
          if (JSON.parse(await readFile(join(directory, "package.json"), "utf8")).name === name)
            break;
        } catch {}
        directory = dirname(directory);
      }
    } catch {
      continue;
    }
  }
  directory = await realpath(directory);
  if (seen.has(directory)) continue;
  seen.add(directory);
  const packageFile = join(directory, "package.json");
  const pkg = JSON.parse(await readFile(packageFile, "utf8"));
  const files = (await readdir(directory)).filter((file) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(file),
  );
  const texts = [];
  for (const file of files) {
    try {
      texts.push(file + "\n" + (await readFile(join(directory, file), "utf8")));
    } catch {}
  }
  notices.push(
    `${pkg.name}@${pkg.version} — ${typeof pkg.license === "string" ? pkg.license : "see package source"}\n${texts.join("\n\n")}`,
  );
  for (const dependency of Object.keys(pkg.dependencies ?? {}))
    queue.push({ name: dependency, from: packageFile });
}
const own = await readFile(join(root, "LICENSE"), "utf8");
await writeFile(
  resolve(root, "pwa/public/THIRD-PARTY-LICENSES.txt"),
  `ChessPratica — GPL-3.0\n${own}\n\n${notices.sort().join("\n\n==================================================\n\n")}\n`,
);
console.log(`Collected ${notices.length} runtime package notices.`);
