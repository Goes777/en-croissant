// Check command grants against Tauri's generated plugin manifests, rather than
// assuming that fs:default includes metadata commands such as stat.
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestsPath = process.argv[2] || join(root, "src-tauri/gen/schemas/acl-manifests.json");
const manifests = JSON.parse(await readFile(manifestsPath, "utf8"));
const fsManifest = manifests.fs;
if (!fsManifest) throw new Error("Tauri's generated filesystem manifest is missing.");

const allowed = new Set();
const denied = new Set();
function expand(identifier, visiting = new Set()) {
  if (visiting.has(identifier)) throw new Error(`Circular filesystem permission: ${identifier}`);
  const next = new Set(visiting).add(identifier);
  const definition =
    identifier === "default"
      ? fsManifest.default_permission
      : fsManifest.permission_sets[identifier] || fsManifest.permissions[identifier];
  if (!definition) throw new Error(`Unknown filesystem permission: ${identifier}`);
  if (definition.platforms && !definition.platforms.includes("windows")) return;
  for (const command of definition.commands?.allow || []) allowed.add(command);
  for (const command of definition.commands?.deny || []) denied.add(command);
  for (const child of definition.permissions || []) expand(child.replace(/^fs:/, ""), next);
}

const capabilitiesDir = join(root, "src-tauri/capabilities");
for (const file of await readdir(capabilitiesDir)) {
  if (!file.endsWith(".json")) continue;
  const capability = JSON.parse(await readFile(join(capabilitiesDir, file), "utf8"));
  if (capability.local === false) continue;
  if (capability.platforms && !capability.platforms.includes("windows")) continue;
  if (!capability.windows?.some((window) => window === "main" || window === "*")) continue;
  for (const permission of capability.permissions) {
    const identifier = typeof permission === "string" ? permission : permission.identifier;
    if (identifier.startsWith("fs:")) expand(identifier.slice(3));
  }
}

const storage = await readFile(join(root, "src/components/courses/storage.ts"), "utf8");
const imports = storage.match(/import\s*\{([^}]+)\}\s*from\s*["']@tauri-apps\/plugin-fs["']/);
if (!imports) throw new Error("Course filesystem imports were not found.");
const commands = imports[1]
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)
  .map((name) => {
    if (!/^[a-zA-Z]+$/.test(name)) throw new Error(`Unsupported filesystem import: ${name}`);
    return name.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
  });
const missing = commands.filter((command) => !allowed.has(command) || denied.has(command));
if (missing.length)
  throw new Error(`Course filesystem commands blocked by ACL: ${missing.join(", ")}`);
console.log(`Course filesystem command grants verified: ${commands.join(", ")}`);
console.log("Path scopes and native runtime behavior must also be checked in the desktop app.");
