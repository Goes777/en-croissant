# Contas locais — ChessPratica 0.17.0

O usuário escolheu contas neste computador, com percurso separado. Esta versão
usa **Better Auth 1.7.14**, fixado no lockfile, com e-mail e senha. Não há conta
na nuvem, envio de e-mails nem sincronização entre computador e celular.

## Usar

Abra **http://127.0.0.1:1431/** e clique em **Entrar / criar conta** no cabeçalho
(**Conta** na tela pequena). Crie uma conta com nome, e-mail identificador e senha
de pelo menos oito caracteres. Depois, **Minha conta** permite editar o nome,
trocar senha, encerrar outras sessões, sair e excluir o próprio cadastro.

Cada conta tem uma biblioteca IndexedDB própria: cursos importados, cartões,
tentativas, revisões, preferências e andamento dos módulos. Os módulos incluídos
no aplicativo ficam disponíveis a todos, mas cada pessoa tem seu progresso.
As abas do mesmo navegador compartilham a sessão; uma troca de conta é refletida
nas outras abas, que deixam de exibir o percurso da pessoa anterior.

O **perfil sem conta** continua contendo os dados anteriores. Para trazê-los a
uma conta, entre nela, abra **Minha conta**, marque a opção de cópia e clique em
**Copiar progresso anterior**. A origem não é apagada. Conflitos são recusados
sem sobrescrever revisões. O backup em **Ajustes** contém apenas a biblioteca
atualmente aberta, não todas as contas.

O servidor local precisa estar aberto para cadastrar, entrar, verificar a sessão
ao reabrir e gerenciar a conta. Ele funciona sem acesso à internet e escuta
somente em 127.0.0.1. Se ele estiver indisponível ao reabrir uma conta, o aplicativo
mostra o bloqueio até conseguir verificar a sessão. Para usar o perfil sem conta,
saia da conta enquanto o servidor estiver aberto.

No pacote distribuído, execute **INICIAR-CHESSPRATICA.cmd**. É necessário Node.js 24. O servidor empacotado inclui as dependências do Better Auth, portanto não
precisa de `pnpm install` para funcionar. Mantenha a janela do servidor aberta.

## Desenvolver e construir

```sh
pnpm install --frozen-lockfile
pnpm build:pwa
pnpm build:server
pnpm start:local
```

`preview:pwa` é apenas uma prévia estática; não oferece endpoints de contas.
`server-dist/serve-pwa.mjs` é o servidor empacotado. Ele deve ficar em uma pasta
ao lado de `dist-pwa/`, por exemplo `scripts/serve-pwa.mjs` no ZIP.

## Armazenamento e limites

- Autenticação: `%LOCALAPPDATA%/ChessPratica/accounts/`, com `accounts.sqlite` e
  a chave `secret`. No Linux/macOS sem LOCALAPPDATA, usa a pasta do usuário.
  `CHESSPRATICA_DATA_DIR` permite escolher outro diretório persistente.
- Bibliotecas pessoais: IndexedDB, nome derivado por SHA-256 do identificador
  do usuário. O banco `ChessPraticaTraining` continua sendo o perfil anterior.
- Os cadastros persistem ao reiniciar o servidor. As sessões usam cookies
  HttpOnly; as senhas são derivadas pelo Better Auth, nunca salvas em texto puro.
- O banco e a chave do servidor não ficam na pasta servida nem no ZIP. Para
  transferir uma instalação, preserve ambos e os backups das bibliotecas de
  cada pessoa. Não apague a chave para reiniciar o aplicativo.
- Contas locais separam o uso do aplicativo; IndexedDB não é um cofre criptografado
  contra alguém que controla o perfil do navegador ou o sistema operacional.
- O e-mail é somente identificador local. Não há recuperação de senha por e-mail
  nesta versão; guarde sua senha e exporte backups do percurso.
- Excluir a conta remove o cadastro e seu banco de progresso neste navegador.
  Backups exportados e dados em outros perfis de navegador não são apagados.

O servidor valida origem e host, limita tentativas e não põe `/api/` no cache
offline. A telemetria do Better Auth está explicitamente desabilitada. O driver
SQLite nativo do Node 24.11 usado na validação emite um aviso de experimental;
as migrações, contas e reinício foram testados efetivamente.

O adaptador HTTP fornece ao Better Auth somente `request.socket.remoteAddress`,
em `x-chesspratica-connection-ip`. Esse cabeçalho é sempre sobrescrito pelo
servidor; `X-Forwarded-For` e `X-Real-IP` enviados pelo cliente não são usados.
Isso evita o aviso de IP ausente e impede trocar o bucket de rate limit por
meio de um cabeçalho falso. Pessoas usando a mesma instalação loopback
compartilham o IP e, portanto, o limite por rota.

O servidor distribuído continua restrito ao loopback. Uma implantação pública
precisa configurar HTTPS, `baseURL` e origens permitidas explícitas, cookies
Secure e segredo persistente fora dos arquivos servidos. Atrás de um proxy,
o IP do socket identifica o proxy: adapte a resolução apenas para proxies
conhecidos, com lista de confiança e cabeçalhos sobrescritos pelo proxy.
Não aceite `X-Forwarded-For` arbitrário nem desative origem, CSRF ou rate limit
para esconder o aviso. Veja as [opções oficiais](https://better-auth.com/docs/reference/options)
e as [proteções de segurança](https://better-auth.com/docs/reference/security).

Ao avaliar um treino, aguarde a volta à agenda antes de recarregar. Enquanto a
transação está pendente, a tela mostra **Salvando revisão…**. O retorno à agenda
só ocorre depois do commit conjunto da tentativa, evento e cartão FSRS.

## Validação em 31/10/2026

- **126 testes Vitest aprovados em 22 arquivos**, incluindo rollback atômico, isolamento entre
  perfis, reabertura, cópia idempotente e preservação do legado.
- **2 testes de integração do servidor aprovados**: credenciais, cookies HttpOnly,
  logout, proteção de origem, ausência de senha em texto puro, persistência,
  IP da conexão e bloqueio da 21ª tentativa apesar de cabeçalhos falsos.
- **2 cenários Playwright de contas aprovados**: duas pessoas com históricos
  diferentes, duas abas, cópia do percurso, nome, senha, exclusão da própria
  conta, tela móvel e bloqueio ao reabrir sem verificar a sessão.
  A gravação é mantida pendente de forma controlada e o IndexedDB real é lido
  pelo identificador autenticado, antes/depois de reload e troca de conta.
- **6 cenários Playwright anteriores aprovados** com internet bloqueada,
  incluindo Stockfish, PGNs, backup/restauração e os 1.312 exercícios pessoais.
- TypeScript desktop/PWA, lint do código novo, build PWA e servidor aprovados.

Todos os cadastros e bancos usados nos testes eram temporários. Não foram
criadas contas no perfil pessoal do usuário durante a validação.

Diagnóstico da falha no GitHub Actions: [CI_ACCOUNTS_FIX.md](CI_ACCOUNTS_FIX.md).

Referências: [instalação Better Auth](https://better-auth.com/docs/installation),
[contas](https://better-auth.com/docs/concepts/users-accounts) e
[sessões](https://better-auth.com/docs/concepts/session-management).
