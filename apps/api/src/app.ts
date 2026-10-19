import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import helmet from "helmet";
import type { HealthResponse } from "@freelah/shared";
import { toNodeHandler } from "better-auth/node";
import type { Auth } from "./auth";
import type { Config } from "./config";
import type { PrismaClient } from "./db";
import { createJobsRouter } from "./routes/jobs";
import { createMeRouter } from "./routes/me";
import { createChatRouter } from "./routes/chat";
import { createProposalsRouter } from "./routes/proposals";
import { createInterestsRouter } from "./routes/interests";
import { createMyJobsRouter } from "./routes/my-jobs";
import { createPreferencesRouter } from "./routes/preferences";
import { createProfilesRouter } from "./routes/profiles";

// Com autenticação, o banco é obrigatório: assim nenhuma rota que depende dele some em silêncio.
export function createApp(config: Pick<Config, "CORS_ORIGINS">): Express;
export function createApp(
  config: Pick<Config, "CORS_ORIGINS">,
  auth: Auth,
  prisma: PrismaClient,
): Express;
export function createApp(
  config: Pick<Config, "CORS_ORIGINS">,
  auth?: Auth,
  prisma?: PrismaClient,
): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  // O Better Auth lê o corpo da requisição sozinho: precisa vir ANTES do express.json().
  if (auth) app.all("/api/auth/*splat", toNodeHandler(auth));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    const body: HealthResponse = {
      status: "ok",
      service: "freelah-api",
      time: new Date().toISOString(),
    };
    res.json(body);
  });

  if (auth) app.use(createMeRouter(auth));
  if (auth && prisma) app.use(createPreferencesRouter(auth, prisma));
  if (auth && prisma) app.use(createMyJobsRouter(auth, prisma));
  if (auth && prisma) app.use(createInterestsRouter(auth, prisma));
  if (auth && prisma) app.use(createChatRouter(auth, prisma));
  if (auth && prisma) app.use(createProposalsRouter(auth, prisma));
  // Categorias e oportunidades são públicas (PRD 9): não dependem de sessão.
  if (prisma) app.use(createJobsRouter(prisma));
  if (prisma) app.use(createProfilesRouter(prisma, auth));

  const notFound: RequestHandler = (_req, res) => {
    res.status(404).json({ error: "not_found", message: "Rota não encontrada." });
  };
  app.use(notFound);

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    // Corpo malformado ou grande demais é erro de quem enviou (4xx), não falha do servidor.
    const status = (err as { status?: unknown }).status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: "bad_request", message: "Não foi possível ler os dados enviados." });
      return;
    }
    console.error(err);
    res
      .status(500)
      .json({ error: "internal_error", message: "Erro interno do servidor." });
  };
  app.use(onError);

  return app;
}
