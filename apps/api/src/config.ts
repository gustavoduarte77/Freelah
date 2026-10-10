import { z } from "zod";

const list = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  // Origens autorizadas a chamar a API pelo navegador, separadas por vírgula.
  CORS_ORIGINS: list("http://localhost:8081"),

  // Conexão com o PostgreSQL (local ou Neon): é só a URL que escolhe o banco.
  DATABASE_URL: z
    .string({ error: "DATABASE_URL não definida (veja apps/api/.env)." })
    .refine((url) => /^postgres(ql)?:\/\//.test(url), "DATABASE_URL precisa começar com postgresql://"),

  // Better Auth. O segredo assina os cookies de sessão: mínimo de 32 caracteres.
  BETTER_AUTH_SECRET: z
    .string({ error: "BETTER_AUTH_SECRET não definida (veja apps/api/.env)." })
    .min(32, "BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres."),
  BETTER_AUTH_URL: z.url().default("http://localhost:3333"),
  // Origens (web e esquema do app) autorizadas a enviar cadastro e login.
  TRUSTED_ORIGINS: list("http://localhost:8081,freelah://"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
