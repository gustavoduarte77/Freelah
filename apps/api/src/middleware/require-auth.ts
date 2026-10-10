import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler, Response } from "express";
import type { Auth, AuthSession } from "../auth";

/**
 * Exige um usuário autenticado. A sessão é lida do cookie (web) ou do cabeçalho Cookie
 * enviado pelo app, e fica disponível com getSession(res). Nunca confia em ids vindos do cliente.
 */
export function requireAuth(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) {
        res.status(401).json({ error: "unauthorized", message: "É preciso entrar para continuar." });
        return;
      }
      res.locals.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getSession(res: Response): AuthSession {
  return res.locals.session as AuthSession;
}
