import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

// Each installation keeps the database and secret locally, outside the web root.
export async function createLocalAuth({ dataDir, baseURL }) {
  await mkdir(dataDir, { recursive: true });
  const secretPath = join(dataDir, "secret");
  try {
    await writeFile(secretPath, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const secret = (await readFile(secretPath, "utf8")).trim();
  if (secret.length < 32) throw new Error("Chave local de autenticação inválida.");
  const database = new DatabaseSync(join(dataDir, "accounts.sqlite"));
  const options = {
    appName: "ChessPratica",
    telemetry: { enabled: false },
    database,
    secret,
    baseURL,
    emailAndPassword: { enabled: true },
    user: { deleteUser: { enabled: true } },
    session: { expiresIn: 60 * 60 * 24 * 7 },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 20 } },
    },
    advanced: { disableOriginCheck: false },
  };
  const migrations = await getMigrations(options);
  await migrations.runMigrations();
  const auth = betterAuth(options);
  await auth.$context;
  return { auth, close: () => database.close() };
}
