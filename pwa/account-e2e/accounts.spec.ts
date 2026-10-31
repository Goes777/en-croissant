import { test, expect, type Page } from "@playwright/test";

async function account(page: Page) {
    await page.getByRole("button", { name: "Conta", exact: true }).click();
}
async function signup(page: Page, name: string, email: string) {
    await account(page);
    await page.getByRole("button", { name: "Criar uma conta", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("password-local-123");
    await page.getByLabel("Confirmar senha", { exact: true }).fill("password-local-123");
    await page.getByRole("button", { name: "Criar minha conta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Conta", exact: true })).toContainText(
        "Minha conta",
    );
}
async function logout(page: Page) {
    await account(page);
    await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Conta", exact: true })).toContainText("Entrar");
}
async function login(page: Page, email: string, password = "password-local-123") {
    await account(page);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
test("cada pessoa mantém seu percurso; troca de conta, senha e cópia do legado", async ({
    page,
    context,
}, info) => {
    const suffix = Date.now(),
        a = `a${suffix}@example.com`,
        b = `b${suffix}@example.com`;
    await page.goto("/");
    await page.getByRole("button", { name: "Adicionar fundamentos guiados", exact: true }).click();
    await signup(page, "Pessoa A", a);
    // The original guest course is not exposed in the newly created account.
    await expect(page.getByRole("button", { name: "Começar revisão", exact: true })).toBeDisabled();
    await account(page);
    await page
        .getByRole("checkbox", {
            name: "Quero copiar o progresso anterior para minha conta",
            exact: true,
        })
        .check();
    await page.getByRole("button", { name: "Copiar progresso anterior", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("20 lições");
    await page.getByRole("button", { name: "Fechar conta", exact: true }).click();
    await page.getByRole("button", { name: "Começar revisão", exact: true }).click();
    await page.getByLabel("Lance por coordenadas", { exact: true }).fill("h5f7");
    await page.getByRole("button", { name: "Jogar", exact: true }).click();
    await page.getByRole("button", { name: "Bom", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        page
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("conta-a-historico.png"), fullPage: true });
    const other = await context.newPage();
    await other.goto("/");
    await logout(other);
    await expect(page.getByRole("button", { name: "Conta", exact: true })).toContainText("Entrar");
    await signup(other, "Pessoa B", b);
    await expect(page.getByRole("button", { name: "Conta", exact: true })).toContainText(
        "Minha conta",
    );
    await other.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        other
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(0);
    await logout(other);
    await login(other, a);
    await expect(other.getByRole("button", { name: "Conta", exact: true })).toContainText(
        "Minha conta",
    );
    await other.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        other
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(1);
    await account(other);
    await other.getByLabel("Nome da conta", { exact: true }).fill("Pessoa A atualizada");
    await other.getByRole("button", { name: "Salvar nome", exact: true }).click();
    await expect(other.getByRole("status")).toContainText("Nome atualizado");
    await other.getByLabel("Senha atual", { exact: true }).fill("password-local-123");
    await other.getByLabel("Nova senha", { exact: true }).fill("new-password-123");
    await other.getByLabel("Confirmar nova senha", { exact: true }).fill("new-password-123");
    await other.getByRole("button", { name: "Alterar senha", exact: true }).click();
    await expect(other.getByRole("status")).toContainText("Senha alterada");
    await other.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await login(other, a);
    await expect(other.getByRole("alert")).toContainText("incorretos");
    await other.getByLabel("Senha", { exact: true }).fill("new-password-123");
    await other.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(other.getByRole("button", { name: "Conta", exact: true })).toContainText(
        "Minha conta",
    );
    await logout(other);
    await login(other, b);
    await expect(other.getByRole("button", { name: "Conta", exact: true })).toContainText(
        "Minha conta",
    );
    await other.getByRole("button", { name: "Adicionar fundamentos guiados", exact: true }).click();
    await account(other);
    await other.getByText("Excluir minha conta", { exact: true }).click();
    await other
        .getByLabel("Senha para excluir a conta", { exact: true })
        .fill("password-local-123");
    await other
        .getByRole("checkbox", {
            name: "Confirmo a exclusão da minha conta e deste progresso",
            exact: true,
        })
        .check();
    await other
        .getByRole("button", { name: "Excluir minha conta definitivamente", exact: true })
        .click();
    await expect(other.getByRole("button", { name: "Conta", exact: true })).toContainText("Entrar");
    await login(other, b);
    await expect(other.getByRole("alert")).toContainText("incorretos");
    await other.getByRole("button", { name: "Fechar conta", exact: true }).click();
    await other.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
        other
            .getByRole("table", { name: "Histórico de tentativas", exact: true })
            .locator("tbody tr"),
    ).toHaveCount(0);
});

test("reabrir offline não desbloqueia uma conta sem verificar sua sessão", async ({
    page,
    context,
}, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await signup(page, "Perfil móvel", `offline${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Adicionar fundamentos guiados", exact: true }).click();
    await expect(page.getByText("Disponível offline", { exact: true })).toBeVisible();
    await account(page);
    await page.screenshot({ path: info.outputPath("conta-celular.png"), fullPage: true });
    await page.getByRole("button", { name: "Fechar conta", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
        true,
    );
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Conta bloqueada", exact: true })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: "Verificar conta novamente", exact: true }).click();
    await expect(page.getByRole("button", { name: "Começar revisão", exact: true })).toBeEnabled();
});
