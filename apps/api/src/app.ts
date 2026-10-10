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
import { createMeRouter } from "./routes/me";

export function createApp(config: Pick<Config, "CORS_ORIGINS">, auth?: Auth): Express {
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

  const notFound: RequestHandler = (_req, res) => {
    res.status(404).json({ error: "not_found", message: "Rota não encontrada." });
  };
  app.use(notFound);

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res
      .status(500)
      .json({ error: "internal_error", message: "Erro interno do servidor." });
  };
  app.use(onError);

  return app;
}
