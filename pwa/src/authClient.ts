import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
    baseURL: location.origin,
    fetchOptions: { credentials: "include" },
});
export type LocalUser = { id: string; name: string; email: string };
export function accountError(error: { code?: string; message?: string } | null | undefined) {
    const messages: Record<string, string> = {
        INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
        INVALID_PASSWORD: "Senha atual incorreta.",
        USER_ALREADY_EXISTS: "Este e-mail já está cadastrado.",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Este e-mail já está cadastrado.",
        PASSWORD_TOO_SHORT: "Use uma senha com pelo menos 8 caracteres.",
        PASSWORD_TOO_LONG: "Use uma senha com no máximo 128 caracteres.",
        INVALID_EMAIL: "Informe um e-mail válido.",
        TOO_MANY_REQUESTS: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    };
    return (
        messages[error?.code ?? ""] ??
        "Não foi possível concluir. Confira os dados e se o servidor local está aberto."
    );
}
