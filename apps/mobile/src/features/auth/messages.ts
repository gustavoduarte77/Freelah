interface AuthError {
  status?: number;
  code?: string;
  message?: string;
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com esse e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com esse e-mail.",
  ADULT_CONFIRMATION_REQUIRED: "É preciso declarar que você tem 18 anos ou mais.",
  INVALID_ORIGIN: "Este endereço não está autorizado a acessar o Freelah.",
};

export const NETWORK_ERROR_MESSAGE =
  "Não foi possível conectar ao servidor. Verifique sua conexão e tente de novo.";

/** Traduz um erro do Better Auth para uma mensagem compreensível em português. */
export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) return "Algo deu errado. Tente novamente.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  // Erros de validação do cadastro já vêm em português do servidor.
  if (error.code === "INVALID_SIGN_UP_DATA" && error.message) return error.message;
  if (error.status === 429) return "Muitas tentativas. Aguarde um instante e tente de novo.";
  if (error.status === undefined || error.status === 0 || error.status >= 500) {
    return NETWORK_ERROR_MESSAGE;
  }
  return "Não foi possível concluir. Confira os dados e tente novamente.";
}
