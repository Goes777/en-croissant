import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("módulo pessoal: 1312 exercícios, etapas, setas, revisão e reabertura offline", async ({
    page,
    context,
}, testInfo) => {
    test.skip(
        !process.env.CHESSPRATICA_PRIVATE_TESTS,
        "Requer os PGNs locais do usuário, que não são publicados no repositório.",
    );
    await context.route("**/*", (route) =>
        route.request().url().startsWith("http://127.0.0.1:1432")
            ? route.continue()
            : route.abort(),
    );
    await page.goto("/");
    await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Cursos", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Táticas Iniciante", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("1312 exercícios · 26 tipos de treino · 5 etapas · 46 exemplos didáticos", {
            exact: true,
        }),
    ).toBeVisible();
    await page.screenshot({
        path: testInfo.outputPath("modulo-taticas-iniciante.png"),
        fullPage: true,
    });
    await page.getByRole("button", { name: "Abrir módulo Táticas Iniciante", exact: true }).click();
    await expect(
        page.getByText("1312 exercícios · vários temas por curso", { exact: true }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Etapa", exact: true }).click();
    await page.getByRole("option", { name: "Etapa 1", exact: true }).click();
    await expect(
        page.getByText("120 exercícios · vários temas por curso", { exact: true }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Tipo de treino", exact: true }).click();
    await page.getByRole("option", { name: "Mate em 1 / Mate com torre", exact: true }).click();
    await expect(
        page.getByText("12 exercícios · vários temas por curso", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Treinar", exact: true }).first().click();
    await expect(
        page.getByRole("heading", {
            name: "Exercício 1 · Mate em 1 / Mate com torre",
            exact: true,
        }),
    ).toBeVisible();
    await page.getByLabel("Lance por coordenadas", { exact: true }).fill("a2a8");
    await page.getByRole("button", { name: "Jogar", exact: true }).click();
    await expect(page.getByText("Resposta correta", { exact: true })).toBeVisible();
    await expect(page.getByText(/Continuações aprovadas:.*Ra8#/)).toBeVisible();
    await page.getByRole("button", { name: "Bom", exact: true }).click();
    await expect(
        page.getByRole("heading", {
            name: "Exercício 2 · Mate em 1 / Mate com torre",
            exact: true,
        }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Cursos", exact: true }).click();
    await page.getByRole("button", { name: "Abrir módulo Táticas Iniciante", exact: true }).click();
    await page.getByRole("combobox", { name: "Conteúdo", exact: true }).click();
    await page.getByRole("option", { name: "Exemplos didáticos", exact: true }).click();
    await expect(
        page.getByText("46 exemplos didáticos · vários temas por curso", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Treinar", exact: true })).toHaveCount(0);
    await page.getByLabel("Pesquisar", { exact: true }).fill("Exemplo didático 2");
    await page.getByRole("button", { name: "Estudar solução", exact: true }).first().click();
    await expect(page.locator("svg.cg-shapes")).toBeVisible();
    await expect(page.locator("svg.cg-shapes line").first()).toHaveAttribute(
        "marker-end",
        "url(#arrowhead-g)",
    );
    await expect(page.getByRole("button", { name: "Próximo lance", exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
        path: testInfo.outputPath("exemplo-didatico-celular.png"),
        fullPage: true,
    });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Salvar backup completo", exact: true }).click();
    const download = await pending,
        path = testInfo.outputPath("taticas-backup.json");
    await download.saveAs(path);
    const backup = JSON.parse(await readFile(path, "utf8"));
    expect(backup.exercises).toHaveLength(1358);
    expect(backup.cards).toHaveLength(1312);
    expect(backup.events).toHaveLength(1);
    expect(
        backup.cards.filter((card: { fsrsCard: { reps: number } }) => card.fsrsCard.reps === 1),
    ).toHaveLength(1);
});
