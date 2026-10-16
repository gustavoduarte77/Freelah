import {
  AT_LEAST_ONE_PREFERENCE_MESSAGE,
  updatePreferencesSchema,
  type PreferencesResponse,
} from "@freelah/shared";
import { Router } from "express";
import type { Auth } from "../auth";
import type { PrismaClient } from "../db";
import { getSession, requireAuth } from "../middleware/require-auth";

const select = { wantsWork: true, wantsToHire: true } as const;

const INVALID_BODY_MESSAGE =
  "Dados inválidos. Envie apenas wantsWork e wantsToHire, cada um como verdadeiro ou falso.";

/**
 * Preferências de uso (PRD 8). Sempre da conta autenticada: o id vem da sessão, nunca do cliente.
 * Preferências personalizam a interface e não são permissões, então esta rota só mexe em
 * UserPreference.
 */
export function createPreferencesRouter(auth: Auth, prisma: PrismaClient): Router {
  const router = Router();
  router.use("/me/preferences", requireAuth(auth), (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/me/preferences", async (_req, res, next) => {
    try {
      const preferences = await prisma.userPreference.findUnique({
        where: { userId: getSession(res).user.id },
        select,
      });
      const body: PreferencesResponse = { preferences };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  router.put("/me/preferences", async (req, res, next) => {
    try {
      const parsed = updatePreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        const atLeastOne = parsed.error.issues.some(
          (issue) => issue.message === AT_LEAST_ONE_PREFERENCE_MESSAGE,
        );
        res.status(400).json({
          error: atLeastOne ? "at_least_one_required" : "validation_error",
          message: atLeastOne ? AT_LEAST_ONE_PREFERENCE_MESSAGE : INVALID_BODY_MESSAGE,
        });
        return;
      }

      const userId = getSession(res).user.id;
      const preferences = await prisma.userPreference.upsert({
        where: { userId },
        update: parsed.data,
        create: { userId, ...parsed.data },
        select,
      });
      const body: PreferencesResponse = { preferences };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
