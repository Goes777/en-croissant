import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import type { TrainingDatabase } from "@/infrastructure/db/TrainingDatabase";
import { copyLegacyProgress } from "@/infrastructure/db/profileDatabase";
import { accountError, authClient, type LocalUser } from "./authClient";

export function AccountDialog({
  opened,
  onClose,
  user,
  db,
  onChanged,
  onDeleted,
  onCopied,
}: {
  opened: boolean;
  onClose: () => void;
  user: LocalUser | null;
  db: TrainingDatabase;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onCopied: () => void;
}) {
  const [signup, setSignup] = useState(false),
    [name, setName] = useState(user?.name ?? ""),
    [email, setEmail] = useState(user?.email ?? ""),
    [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copyConsent, setCopyConsent] = useState(false),
    [deleteConsent, setDeleteConsent] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }
  async function check(result: Promise<{ error: { code?: string; message?: string } | null }>) {
    const { error } = await result;
    if (error) throw new Error(accountError(error));
  }
  return (
    <Modal
      closeButtonProps={{ "aria-label": "Fechar conta" }}
      opened={opened}
      onClose={busy ? () => {} : onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      title={user ? "Minha conta local" : signup ? "Criar conta local" : "Entrar na conta"}
      size="lg"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Contas deste computador. Cada pessoa tem seus cursos, percurso e revisões. O e-mail
          identifica a conta; nenhum e-mail é enviado.
        </Text>
        {error && (
          <Alert role="alert" color="red">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert role="status" color="green">
            {notice}
          </Alert>
        )}
        {!user ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (signup && password !== confirm) throw new Error("As senhas não coincidem.");
                if (signup)
                  await check(
                    authClient.signUp.email({ name: name.trim(), email: email.trim(), password }),
                  );
                else await check(authClient.signIn.email({ email: email.trim(), password }));
                setPassword("");
                setConfirm("");
                await onChanged();
                onClose();
              });
            }}
          >
            <Stack>
              {signup && (
                <TextInput
                  label="Nome"
                  aria-label="Nome"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  autoComplete="name"
                />
              )}
              <TextInput
                label="E-mail"
                aria-label="E-mail"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                autoComplete="username"
              />
              <PasswordInput
                label="Senha"
                aria-label="Senha"
                required
                minLength={signup ? 8 : undefined}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                autoComplete={signup ? "new-password" : "current-password"}
              />
              {signup && (
                <PasswordInput
                  label="Confirmar senha"
                  aria-label="Confirmar senha"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.currentTarget.value)}
                  autoComplete="new-password"
                />
              )}
              <Button type="submit" loading={busy}>
                {signup ? "Criar minha conta" : "Entrar"}
              </Button>
              <Button
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                  setPassword("");
                  setConfirm("");
                }}
              >
                {signup ? "Já tenho uma conta" : "Criar uma conta"}
              </Button>
            </Stack>
          </form>
        ) : (
          <>
            <Text size="sm">Conectado como {user.email}</Text>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await check(authClient.updateUser({ name: name.trim() }));
                  await onChanged();
                  setNotice("Nome atualizado.");
                });
              }}
            >
              <Group align="end">
                <TextInput
                  flex={1}
                  label="Nome da conta"
                  aria-label="Nome da conta"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
                <Button type="submit" disabled={busy}>
                  Salvar nome
                </Button>
              </Group>
            </form>
            <Divider label="Senha" />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (next !== confirm) throw new Error("As senhas não coincidem.");
                  await check(
                    authClient.changePassword({
                      currentPassword: current,
                      newPassword: next,
                      revokeOtherSessions: true,
                    }),
                  );
                  setCurrent("");
                  setNext("");
                  setConfirm("");
                  await onChanged();
                  setNotice("Senha alterada. As outras sessões foram encerradas.");
                });
              }}
            >
              <Stack gap="sm">
                <PasswordInput
                  label="Senha atual"
                  aria-label="Senha atual"
                  required
                  value={current}
                  onChange={(event) => setCurrent(event.currentTarget.value)}
                  autoComplete="current-password"
                />
                <PasswordInput
                  label="Nova senha"
                  aria-label="Nova senha"
                  required
                  minLength={8}
                  maxLength={128}
                  value={next}
                  onChange={(event) => setNext(event.currentTarget.value)}
                  autoComplete="new-password"
                />
                <PasswordInput
                  label="Confirmar nova senha"
                  aria-label="Confirmar nova senha"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.currentTarget.value)}
                  autoComplete="new-password"
                />
                <Button type="submit" disabled={busy} variant="light">
                  Alterar senha
                </Button>
              </Stack>
            </form>
            <Divider label="Percurso anterior" />
            <Text size="sm">
              Você pode copiar para esta conta os cursos e as revisões do perfil sem conta deste
              navegador. A origem fica preservada e conflitos não sobrescrevem seu histórico.
            </Text>
            <Checkbox
              label="Quero copiar o progresso anterior para minha conta"
              checked={copyConsent}
              onChange={(event) => setCopyConsent(event.currentTarget.checked)}
            />
            <Button
              variant="light"
              disabled={busy || !copyConsent}
              onClick={() =>
                void run(async () => {
                  const result = await copyLegacyProgress(db);
                  setCopyConsent(false);
                  onCopied();
                  setNotice(`${result.exercises} lições e ${result.events} revisões copiadas.`);
                })
              }
            >
              Copiar progresso anterior
            </Button>
            <Divider label="Sessões" />
            <Button
              variant="default"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await check(authClient.revokeOtherSessions());
                  setNotice("As outras sessões desta conta foram encerradas.");
                })
              }
            >
              Encerrar outras sessões
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await check(authClient.signOut());
                  await onChanged();
                  onClose();
                })
              }
            >
              Sair da conta
            </Button>
            <details>
              <summary>Excluir minha conta</summary>
              <Stack mt="sm">
                <Text size="sm">
                  Exclui este cadastro e o progresso desta conta neste navegador. Exporte seu backup
                  em Ajustes antes de excluir. Cópias em outros navegadores precisam ser removidas
                  neles.
                </Text>
                <PasswordInput
                  label="Senha para excluir a conta"
                  aria-label="Senha para excluir a conta"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  autoComplete="current-password"
                />
                <Checkbox
                  checked={deleteConsent}
                  onChange={(event) => setDeleteConsent(event.currentTarget.checked)}
                  label="Confirmo a exclusão da minha conta e deste progresso"
                />
                <Button
                  color="red"
                  disabled={busy || !deleteConsent || !password}
                  onClick={() =>
                    void run(async () => {
                      await check(authClient.deleteUser({ password }));
                      await onDeleted();
                      onClose();
                    })
                  }
                >
                  Excluir minha conta definitivamente
                </Button>
              </Stack>
            </details>
          </>
        )}
      </Stack>
    </Modal>
  );
}
