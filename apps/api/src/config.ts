import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  // Origens autorizadas a chamar a API, separadas por vírgula.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8081")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
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
