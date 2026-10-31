import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  MantineProvider,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { trainingDb, type TrainingDatabase } from "@/infrastructure/db/TrainingDatabase";
import { profileDatabase } from "@/infrastructure/db/profileDatabase";
import { App } from "./App";
import { TrainingDbContext } from "./TrainingDbContext";
import { AccountDialog } from "./AccountDialog";
import { authClient, type LocalUser } from "./authClient";

const channelName = "chesspratica-account";
export function AccountApp() {
  const [identity, setIdentity] = useState<{ user: LocalUser | null; db: TrainingDatabase }>({
      user: null,
      db: trainingDb,
    }),
    [checking, setChecking] = useState(true),
    [locked, setLocked] = useState(false),
    [opened, setOpened] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const sequence = useRef(0),
    databases = useRef(new Map<string, TrainingDatabase>()),
    channel = useRef<BroadcastChannel | null>(null);
  const verify = useCallback(async (block = false) => {
    const ticket = ++sequence.current;
    if (block) setChecking(true);
    try {
      const { data, error } = await authClient.getSession({ query: { disableCookieCache: true } });
      if (error)
        throw new Error(
          "Não foi possível verificar a conta. Abra o servidor local do ChessPratica e tente novamente.",
        );
      const user = data?.user ?? null;
      let db = trainingDb;
      if (user) {
        db = databases.current.get(user.id) ?? (await profileDatabase(user.id));
        databases.current.set(user.id, db);
      }
      if (ticket !== sequence.current) return;
      localStorage.setItem("chesspratica-had-session", user ? "1" : "0");
      setIdentity({ user, db });
      setLocked(false);
      setError("");
      return true;
    } catch (cause) {
      if (ticket === sequence.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
        if (block && localStorage.getItem("chesspratica-had-session") === "1") setLocked(true);
        return false;
      }
    } finally {
      if (ticket === sequence.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    // Initialize from the external authentication service.
    // oxlint-disable-next-line react/set-state-in-effect
    void verify(true);
    const activeChannel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
    channel.current = activeChannel;
    if (activeChannel)
      activeChannel.onmessage = () => {
        setOpened(false);
        void verify(true);
      };
    const refresh = () => {
      if (document.visibilityState === "visible") void verify();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === "chesspratica-account-change") {
        setOpened(false);
        void verify(true);
      }
    };
    addEventListener("focus", refresh);
    addEventListener("storage", changed);
    const timer = setInterval(refresh, 60_000);
    return () => {
      // Invalidate pending requests; this is a request counter, not a DOM ref.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
      activeChannel?.close();
      clearInterval(timer);
      removeEventListener("focus", refresh);
      removeEventListener("storage", changed);
    };
  }, [verify]);
  async function changed() {
    channel.current?.postMessage("changed");
    localStorage.setItem("chesspratica-account-change", crypto.randomUUID());
    if (!(await verify()))
      throw new Error("Não foi possível verificar a nova sessão. Tente novamente.");
  }
  async function deleted() {
    const db = identity.db;
    setChecking(true);
    setIdentity({ user: null, db: trainingDb });
    localStorage.setItem("chesspratica-had-session", "0");
    try {
      channel.current?.postMessage("changed");
      localStorage.setItem("chesspratica-account-change", crypto.randomUUID());
      await db.delete();
      if (identity.user) databases.current.delete(identity.user.id);
      await changed();
    } finally {
      setChecking(false);
    }
  }
  return (
    <MantineProvider forceColorScheme="dark">
      {checking ? (
        <Container py="xl">
          <Group>
            <Loader size="sm" />
            <Text>Verificando conta local…</Text>
          </Group>
        </Container>
      ) : locked ? (
        <Container size="sm" py="xl">
          <Stack>
            <Title order={2}>Conta bloqueada</Title>
            <Text>{error}</Text>
            <Button onClick={() => void verify(true)}>Verificar conta novamente</Button>
            <Button
              variant="default"
              onClick={() => {
                setIdentity({ user: null, db: trainingDb });
                setLocked(false);
              }}
            >
              Abrir perfil sem conta
            </Button>
          </Stack>
        </Container>
      ) : (
        <TrainingDbContext.Provider value={identity.db}>
          <App
            key={`${identity.user?.id ?? "guest"}:${revision}`}
            accountName={identity.user?.name}
            accountControls={
              <Button size="xs" variant="light" aria-label="Conta" onClick={() => setOpened(true)}>
                <span className="account-desktop-label">
                  {identity.user ? "Minha conta" : "Entrar / criar conta"}
                </span>
                <span className="account-mobile-label">Conta</span>
              </Button>
            }
          />
        </TrainingDbContext.Provider>
      )}
      <AccountDialog
        key={`${opened}:${identity.user?.id ?? "guest"}`}
        opened={opened && !checking && !locked}
        onClose={() => setOpened(false)}
        user={identity.user}
        db={identity.db}
        onChanged={changed}
        onDeleted={deleted}
        onCopied={() => setRevision((value) => value + 1)}
      />
      {opened && error && (
        <Alert className="account-connection" color="orange">
          {error}
        </Alert>
      )}
    </MantineProvider>
  );
}
