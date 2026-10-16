/**
 * Destino de retorno depois do login ou cadastro (PRD 9): só caminhos internos do próprio app.
 * Qualquer outra coisa (link externo, "//", esquema, rota de autenticação) é descartada para
 * ninguém poder mandar a pessoa para fora do Freelah por um link manipulado.
 */
export function safeInternalRedirect(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length > 200) return null;
  if (!/^\/[A-Za-z0-9/_.-]*$/.test(raw)) return null;
  if (raw.startsWith("//") || raw.includes("..")) return null;
  if (raw === "/entrar" || raw === "/cadastrar") return null;
  return raw;
}
