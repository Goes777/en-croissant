import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("treino no tabuleiro, FSRS, reabertura e backup inteiramente offline", async ({
    page,
    context,
    browser,
}, testInfo) => {
    const remote: string[] = [];
    await context.route("**/*", (route) => {
        if (
            !route.request().url().startsWith("http://127.0.0.1:1431") &&
            !route.request().url().startsWith("data:")
        ) {
            remote.push(route.request().url());
            return route.abort();
        }
        return route.continue();
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Adicionar fundamentos guiados", exact: true }).click();
    await expect(page.getByRole("button", { name: "Começar revisão", exact: true })).toBeEnabled();
    await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
    const cdp = await context.newCDPSession(page);
    const installability = await cdp.send("Page.getInstallabilityErrors");
    expect(
        installability.installabilityErrors.filter((error) => error.errorId !== "in-incognito"),
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("desktop-hoje.png"), fullPage: true });
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Começar revisão", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mate em f7", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("desktop-treino.png"), fullPage: true });
    const queen = page.locator("cg-board piece.white.queen:not(.ghost)");
    await expect(queen).not.toHaveClass(/\banim\b/);
    const queenBounds = await queen.boundingBox();
    if (!queenBounds) throw new Error("Queen missing");
    await page.mouse.click(
        queenBounds.x + queenBounds.width / 2,
        queenBounds.y + queenBounds.height / 2,
    );
    const bounds = await page.locator("cg-board").boundingBox();
    if (!bounds) throw new Error("Board missing");
    await page.mouse.click(
        bounds.x + (bounds.width * 5.5) / 8,
        bounds.y + (bounds.height * 1.5) / 8,
    );
    await expect(page.getByText("Resposta correta", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Análise complementar local", exact: true }).click();
    await expect(page.getByText(/^bestmove /)).toBeVisible();
    await page.getByRole("button", { name: "Bom", exact: true }).click();
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        page
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(1);
    await page.reload();
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        page
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Salvar backup completo", exact: true }).click();
    const download = await pending;
    const path = testInfo.outputPath("backup.json");
    await download.saveAs(path);
    const backup = JSON.parse(await readFile(path, "utf8"));
    expect(backup.exercises).toHaveLength(20);
    expect(backup.cards).toHaveLength(20);
    expect(backup.events).toHaveLength(1);
    expect(backup.attempts).toHaveLength(1);
    expect(
        backup.cards.find((x: { fsrsCard: { reps: number } }) => x.fsrsCard.reps === 1),
    ).toBeTruthy();
    // The host antivirus injects this request independently of our bundle. It is
    // aborted by the same offline policy; no third-party request is allowed out.
    expect(remote.filter((url) => !new URL(url).hostname.endsWith(".kaspersky-labs.com"))).toEqual(
        [],
    );
    const restored = await browser.newContext({ baseURL: "http://127.0.0.1:1431" });
    await restored.route("**/*", (route) =>
        route.request().url().startsWith("http://127.0.0.1:1431")
            ? route.continue()
            : route.abort(),
    );
    const fresh = await restored.newPage();
    await fresh.goto("/");
    await expect(fresh.getByText("Disponível offline", { exact: true })).toBeVisible();
    await restored.setOffline(true);
    await fresh.getByRole("button", { name: "Importar", exact: true }).click();
    await fresh.locator('input[type="file"]').setInputFiles(path);
    await fresh.getByRole("button", { name: "Analisar arquivos", exact: true }).click();
    await fresh
        .getByRole("checkbox", {
            name: "Confirmo a restauração deste backup neste dispositivo",
            exact: true,
        })
        .check();
    await fresh.getByRole("button", { name: "Restaurar backup", exact: true }).click();
    await expect(
        fresh.getByRole("heading", { name: "Cursos e exercícios", exact: true }),
    ).toBeVisible();
    await fresh.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        fresh
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(1);
    await restored.close();
});

test("PGN com variantes: réplica obrigatória, rejeição de lance extra e reimportação sem duplicatas", async ({
    page,
    context,
}) => {
    await page.goto("/");
    await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
    await context.setOffline(true);
    async function importCourse() {
        await page.getByRole("button", { name: "Importar", exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles({
            name: "sequencia.pgn",
            mimeType: "text/plain",
            buffer: Buffer.from(
                '[Event "Sequência de desenvolvimento"]\n\n{Comentário original.} 1. e4 e5 2. Nf3 (2. Bc4 {Alternativa aprovada.}) *',
            ),
        });
        await page.getByRole("button", { name: "Analisar arquivos", exact: true }).click();
        await page.getByRole("checkbox", { name: /Revisei o conteúdo/ }).check();
        await page.getByRole("button", { name: "Publicar curso", exact: true }).click();
        await expect(
            page.getByRole("heading", { name: "Sequência de desenvolvimento", exact: true }),
        ).toBeVisible();
    }
    await importCourse();
    await importCourse();
    await expect(page.getByRole("button", { name: "Treinar", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Treinar", exact: true }).click();
    await page.getByLabel("Lance por coordenadas", { exact: true }).fill("e2e4");
    await page.getByRole("button", { name: "Jogar", exact: true }).click();
    await expect(page.getByText("Resposta correta", { exact: true })).toHaveCount(0);
    await page.getByLabel("Lance por coordenadas", { exact: true }).fill("g1h3");
    await page.getByRole("button", { name: "Jogar", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("não pertence às soluções aprovadas");
    await page.getByLabel("Lance por coordenadas", { exact: true }).fill("f1c4");
    await page.getByRole("button", { name: "Jogar", exact: true }).click();
    await expect(page.getByText("Resposta correta", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Novamente", exact: true }).click();
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        page
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(1);
    await expect(
        page
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toContainText("0 / 1");
});

test("interface de celular e estratégia com dois planos corretos", async ({
    page,
    context,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Adicionar fundamentos guiados", exact: true }).click();
    await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Cursos", exact: true }).click();
    await page.getByLabel("Pesquisar", { exact: true }).fill("Dois planos");
    await page.getByRole("button", { name: "Treinar", exact: true }).click();
    await page
        .getByRole("checkbox", { name: "Desenvolver o bispo e preparar o roque", exact: true })
        .check();
    await page
        .getByRole("checkbox", { name: "Preparar d4 para disputar o centro", exact: true })
        .check();
    await page.getByRole("button", { name: "Conferir resposta", exact: true }).click();
    await expect(page.getByText("Resposta correta", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fácil", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Bom", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("celular-cursos.png"), fullPage: true });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
});

test("manifesto e requisitos de instalação em perfil normal isolado", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cp-pwa-profile-"));
    if (!resolve(profile).startsWith(resolve(tmpdir(), "cp-pwa-profile-")))
        throw new Error("Unexpected test profile path");
    const context = await chromium.launchPersistentContext(profile, {
        channel: process.env.CI ? undefined : "chrome",
        headless: true,
    });
    try {
        await context.route("**/*", (route) =>
            route.request().url().startsWith("http://127.0.0.1:1431")
                ? route.continue()
                : route.abort(),
        );
        const page = await context.newPage();
        await page.goto("http://127.0.0.1:1431");
        await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
        const cdp = await context.newCDPSession(page);
        await expect
            .poll(async () => (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors)
            .toEqual([]);
    } finally {
        await context.close();
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});

test("cria uma lição por FEN, percorre a solução e exporta um PGN legal", async ({
    page,
    context,
}, testInfo) => {
    await page.goto("/");
    await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await page.getByText("Criar exercício a partir de uma posição FEN", { exact: true }).click();
    await page.getByLabel("Nome do exercício", { exact: true }).fill("Mate criado localmente");
    await page
        .getByLabel("FEN da posição", { exact: true })
        .fill("6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1");
    await page
        .getByLabel("Pergunta do exercício", { exact: true })
        .fill("Encontre o mate na última fileira.");
    await page
        .getByLabel("Solução em SAN (para exercícios de lances)", { exact: true })
        .fill("1. Re8#");
    await page
        .getByLabel("Explicação da solução", { exact: true })
        .fill("A torre domina a última fileira e os peões bloqueiam as fugas do rei.");
    await page.getByRole("button", { name: "Preparar exercício da posição", exact: true }).click();
    await page.getByRole("checkbox", { name: /Revisei o conteúdo/ }).check();
    await page.getByRole("button", { name: "Publicar curso", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Mate criado localmente", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Estudar solução", exact: true }).click();
    await page.getByRole("button", { name: "Próximo lance", exact: true }).click();
    await expect(page.getByTestId("chessboard")).toHaveAttribute(
        "aria-label",
        "Tabuleiro: pretas a jogar",
    );
    await page.getByRole("button", { name: "Voltar à biblioteca", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar PGN", exact: true }).click();
    const download = await pending,
        path = testInfo.outputPath("autoria.pgn");
    await download.saveAs(path);
    expect(await readFile(path, "utf8")).toContain("Re8#");
});
