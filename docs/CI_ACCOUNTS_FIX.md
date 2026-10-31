# Falha do histórico no E2E de contas — 31/10/2026

Execução analisada: [41220760041](https://github.com/Goes777/en-croissant/actions/runs/41220760041),
commit `8a0bb278a4a7ce426861a105920cac0699f8d89b`, artefato `13049489059`.
Foram consultados `trace.zip`, `error-context.md` e a captura da falha.

## Causa

O teste clicava em **Bom** e recarregava imediatamente a página. No trace,
o clique termina em `2350.551 ms` (`jygk@83`) e o reload começa em
`2352.612 ms` (`jygk@85`): apenas **2.061 ms** depois. O Playwright aguarda
o despacho do clique, não a Promise de `recordReview`. Uma navegação antes
do commit pode abortar a transação IndexedDB; esperar mais pela tabela depois
de destruir a página não recupera uma gravação interrompida.

A captura e o contexto mostram **Pessoa A** e a tabela correta, realmente
vazia. O seletor pelo papel `table`, nome exato **Histórico de tentativas** e
`tbody tr` está correto. Não foi necessário alterá-lo.

## Verificações e correção

- `recordReview` já retorna a Promise da transação Dexie que inclui tentativa,
  evento e cartão. `onSaved` só é chamado após sua conclusão; essa garantia
  foi preservada. Um teste adicional injeta falha ao gravar o evento e comprova
  rollback completo, seguido de nova gravação bem-sucedida.
- O E2E mantém uma transação nativa real pendente por solicitações de leitura,
  liberadas explicitamente. A instrumentação é instalada antes da abertura do
  banco porque Dexie guarda uma função nativa vinculada durante a abertura.
  Nenhum timer ou atraso fixo é usado para completar a gravação.
- A tela mostra **Salvando revisão…** e impede voltar à agenda por seu botão
  enquanto grava. O teste aguarda a volta à agenda, que sinaliza a conclusão,
  e verifica a atualização do histórico antes de recarregar.
- O E2E lê diretamente o IndexedDB do navegador, com nome derivado do SHA-256
  do `user.id` obtido da sessão. Confere tentativa, evento vinculado e avanço
  FSRS; recarrega e exige os mesmos dados. Não é um mock de persistência.
- O perfil sem conta e a Pessoa B continuam sem tentativas/eventos. Ao entrar
  novamente como A, o identificador e todos os registros salvos são os mesmos.
  O cenário existente mantém logout entre abas, senha, exclusão e bloqueio offline.
- O Context de React entrega a cada árvore a instância do banco daquele
  identificador. Uma troca de usuário remonta a aplicação; não há ponteiro
  global mutável para outro banco durante a gravação.
- Os resultados de contas e de PWA ficam em subpastas distintas de
  `test-results/`, para uma suíte não apagar os artefatos da outra no CI.
  O upload exclui os bancos e segredos temporários do servidor de teste.
  TypeScript e lint agora também cobrem os auxiliares do E2E de contas.

Os timeouts originais e todas as verificações de histórico foram mantidos.

## Aviso do Better Auth

O adaptador Node recebia cabeçalhos HTTP, mas nenhum IP de cliente confiável.
O Better Auth recorria ao bucket compartilhado `no-trusted-ip` por rota e emitia
o aviso. Isso é independente da gravação no IndexedDB.

O servidor agora sobrescreve um cabeçalho próprio com o IP validado do socket
e configura `advanced.ipAddress.ipAddressHeaders` somente para ele. Um teste
HTTP real confirma `127.0.0.1` na sessão mesmo com cabeçalhos falsos, e exige
HTTP 429 na 21ª tentativa de login variando esses cabeçalhos a cada chamada.
Origem, CSRF e limitação permanecem ativos. A configuração para implantação
pública e proxy está descrita em [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md), com
referências à documentação oficial do Better Auth.

## Validação local

- `pnpm test`: 126 testes, 22 arquivos, todos aprovados.
- `pnpm test:auth`: 2 integrações aprovadas; inclui IP real, cabeçalhos falsos e rate limit.
- `pnpm test:e2e:accounts`: 2 cenários aprovados, com transação mantida pendente,
  leitura do IndexedDB real e isolamento também na outra aba.
- `CHESSPRATICA_PRIVATE_TESTS=1 pnpm test:e2e:pwa`: 6 cenários aprovados,
  incluindo os 1.312 exercícios pessoais, offline, PGN, FSRS, backup e instalação.
  Os PGNs pessoais continuam fora do repositório e do CI público.
- TypeScript desktop/PWA, lint dos arquivos alterados, formatação e builds
  PWA/servidor aprovados. O lint geral mantém avisos existentes no código desktop.

O aviso de IP ausente não apareceu nas integrações HTTP nem no E2E de contas.
Continuam os avisos esperados de credenciais inválidas nos testes negativos,
SQLite experimental no Node 24 e tamanho do bundle no Vite.
