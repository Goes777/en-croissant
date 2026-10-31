import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isIP } from "node:net";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

// Only this server may supply the IP used for sessions and rate limiting.
export const connectionIpHeader = "x-chesspratica-connection-ip";
export function setConnectionIp(request) {
  delete request.headers[connectionIpHeader];
  const address = request.socket.remoteAddress;
  if (address && isIP(address)) request.headers[connectionIpHeader] = address;
}

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
    advanced: {
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: [connectionIpHeader] },
    },
  };
  const migrations = await getMigrations(options);
  await migrations.runMigrations();
  const auth = betterAuth(options);
  await auth.$context;
  return { auth, close: () => database.close() };
}
