import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { toNodeHandler } from "better-auth/node";
import { connectionIpHeader, createLocalAuth, setConnectionIp } from "./local-auth.mjs";

test("contas locais: credenciais, sessões, origem e persistência", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cp-local-auth-test-"));
  let instance;
  const origin = "http://127.0.0.1:1439";
  try {
    instance = await createLocalAuth({ dataDir: directory, baseURL: origin });
    const call = (path, body, cookie, requestOrigin = origin) =>
      instance.auth.handler(
        new Request(origin + "/api/auth/" + path, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            Origin: requestOrigin,
            // Better Auth's in-memory rate-limit buckets are shared in this process.
            [connectionIpHeader]: "192.0.2.10",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const signup = await call("sign-up/email", {
      name: "Pessoa A",
      email: "a@example.com",
      password: "secret-test-1234",
    });
    assert.equal(signup.status, 200);
    const a = await signup.json();
    const cookie = signup.headers.get("set-cookie").split(";")[0];
    assert.match(signup.headers.get("set-cookie"), /HttpOnly/i);
    const session = await call("get-session", undefined, cookie);
    assert.equal((await session.json()).user.id, a.user.id);
    const bResponse = await call("sign-up/email", {
      name: "Pessoa B",
      email: "b@example.com",
      password: "other-secret-1234",
    });
    const b = await bResponse.json();
    assert.notEqual(b.user.id, a.user.id);
    assert.notEqual(
      (await call("sign-in/email", { email: "a@example.com", password: "wrong-pass" })).status,
      200,
    );
    assert.notEqual((await call("update-user", { name: "Invader" })).status, 200);
    assert.notEqual(
      (await call("update-user", { name: "Invader" }, cookie, "https://foreign.example")).status,
      200,
    );
    const signout = await call("sign-out", {}, cookie);
    assert.equal(signout.status, 200);
    assert.equal(await (await call("get-session", undefined, cookie)).json(), null);
    const dbBytes = await readFile(join(directory, "accounts.sqlite"));
    assert.equal(dbBytes.includes(Buffer.from("secret-test-1234")), false);
    instance.close();
    instance = await createLocalAuth({ dataDir: directory, baseURL: origin });
    const login = await call("sign-in/email", {
      email: "a@example.com",
      password: "secret-test-1234",
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.id, a.user.id);
  } finally {
    instance?.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), "cp-local-auth-test-")));
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("adaptador HTTP usa o IP da conexão e impede burlar o limite com cabeçalhos falsos", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cp-local-auth-test-"));
  let instance, server;
  try {
    // An ephemeral port avoids sharing either accounts or rate-limit state with other tests.
    server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    instance = await createLocalAuth({ dataDir: directory, baseURL: origin });
    const handler = toNodeHandler(instance.auth);
    server.on("request", (request, response) => {
      setConnectionIp(request);
      void handler(request, response);
    });
    const call = (path, body, index = 1, cookie) =>
      fetch(origin + "/api/auth/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          "X-Forwarded-For": `198.51.100.${index}`,
          "X-Real-IP": `198.51.100.${index}`,
          [connectionIpHeader]: `198.51.100.${index}`,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const signup = await call("sign-up/email", {
      name: "IP test",
      email: "ip@example.com",
      password: "secret-test-1234",
    });
    assert.equal(signup.status, 200);
    const cookie = signup.headers.get("set-cookie").split(";")[0];
    await signup.arrayBuffer();
    const session = await call("get-session", undefined, 2, cookie);
    assert.equal((await session.json()).session.ipAddress, "127.0.0.1");
    for (let index = 1; index <= 21; index++) {
      const response = await call(
        "sign-in/email",
        {
          email: "ip@example.com",
          password: "wrong-password",
        },
        index,
      );
      assert.equal(response.status, index <= 20 ? 401 : 429);
      await response.arrayBuffer();
    }
  } finally {
    if (server?.listening)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    instance?.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), "cp-local-auth-test-")));
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});
