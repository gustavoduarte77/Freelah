import { expo } from "@better-auth/expo";
import { signUpSchema } from "@freelah/shared";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Config } from "./config";
import type { PrismaClient } from "./db";

export type AuthConfig = Pick<
  Config,
  "NODE_ENV" | "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "TRUSTED_ORIGINS"
>;

export function createAuth(config: AuthConfig, prisma: PrismaClient) {
  return betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // Funciona sem internet: nada é enviado para fora.
    telemetry: { enabled: false },
    trustedOrigins: [
      ...config.TRUSTED_ORIGINS,
      // Expo Go em desenvolvimento usa o esquema exp:// (IP do computador na rede local).
      ...(config.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
    ],
    plugins: [expo()],
    // O Better Auth desliga a verificação de origem sozinho quando NODE_ENV=test; fixá-la como
    // ligada faz os testes se comportarem exatamente como a produção.
    advanced: { disableOriginCheck: false },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Sem provedor de e-mail no MVP: a conta já nasce utilizável (veja o roadmap).
      requireEmailVerification: false,
    },

    user: {
      // O PRD chama a foto de avatarUrl; o Better Auth chama de image.
      fields: { image: "avatarUrl" },
      additionalFields: {
        phone: { type: "string", required: true },
        city: { type: "string", required: true },
        // Definido só pelo servidor (hook abaixo); o cliente nunca consegue enviá-lo.
        adultConfirmedAt: { type: "date", required: false, input: false, returned: false },
      },
    },

    hooks: {
      // O cadastro é revalidado aqui com as mesmas regras do app, inclusive a declaração de 18+.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const parsed = signUpSchema.safeParse(ctx.body);
        if (parsed.success) return;
        const issue = parsed.error.issues[0];
        const isAdultIssue = issue?.path[0] === "adultConfirmed";
        throw new APIError("BAD_REQUEST", {
          message: issue?.message ?? "Dados de cadastro inválidos.",
          code: isAdultIssue ? "ADULT_CONFIRMATION_REQUIRED" : "INVALID_SIGN_UP_DATA",
        });
      }),
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              // Só os dígitos do telefone; o registro da maioridade usa a hora do servidor.
              phone: String(user.phone).replace(/\D/g, ""),
              adultConfirmedAt: new Date(),
            },
          }),
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
