import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import helmet from "helmet";
import type { HealthResponse } from "@freelah/shared";
import type { Config } from "./config";

export function createApp(config: Pick<Config, "CORS_ORIGINS">): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  // Os handlers do Better Auth (etapa 2) serão montados aqui, antes do express.json().
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    const body: HealthResponse = {
      status: "ok",
      service: "freelah-api",
      time: new Date().toISOString(),
    };
    res.json(body);
  });

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
