import {
  jobFieldErrors,
  preferencesFromRoles,
  rolesFromPreferences,
  updateProfileSchema,
  type PublicProfileResponse,
} from "@freelah/shared";
import { Router } from "express";
import type { Auth } from "../auth";
import type { PrismaClient } from "../db";
import { getSession, requireAuth } from "../middleware/require-auth";

/** Só o que é público: nada de telefone, e-mail, data de nascimento nem as preferências em si. */
const profileSelect = {
  id: true,
  name: true,
  city: true,
  avatarUrl: true,
  headline: true,
  bio: true,
  isDemo: true,
  preference: { select: { wantsWork: true, wantsToHire: true } },
} as const;

type ProfileRow = {
  id: string;
  name: string;
  city: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  isDemo: boolean;
  preference: { wantsWork: boolean; wantsToHire: boolean } | null;
};

function toProfile(user: ProfileRow): PublicProfileResponse {
  return {
    profile: {
      id: user.id,
      name: user.name,
      city: user.city,
      state: null,
      avatarUrl: user.avatarUrl,
      headline: user.headline,
      bio: user.bio,
      // Serviços, avaliações e serviços concluídos ainda não existem no banco: saem vazios.
      services: [],
      rating: null,
      reviews: [],
      completedServices: [],
      roles: rolesFromPreferences(user.preference),
      isDemo: user.isDemo,
    },
  };
}

/**
 * Perfil (PRD 22).
 * - `GET /profiles/:id`: público (sem login). Nome, cidade, foto, ocupação, apresentação e papéis.
 * - `GET /me/profile` e `PATCH /me/profile`: sempre da conta autenticada (o id vem da sessão, nunca do cliente).
 *   O PATCH edita papéis, ocupação, apresentação e cidade; os papéis gravam as mesmas preferências de uso do
 *   onboarding (Profissional = encontrar trabalho, Contratante = contratar alguém), na mesma transação.
 * Nenhuma rota devolve telefone, e-mail nem as preferências em si.
 */
export function createProfilesRouter(prisma: PrismaClient, auth?: Auth): Router {
  const router = Router();

  router.get("/profiles/:id", async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      const id = req.params.id as string;
      const user = id.length > 0 && id.length <= 64 ? await prisma.user.findUnique({ where: { id }, select: profileSelect }) : null;
      if (!user) {
        res.status(404).json({ error: "not_found", message: "Perfil não encontrado." });
        return;
      }
      res.json(toProfile(user));
    } catch (error) {
      next(error);
    }
  });

  if (!auth) return router;

  router.use("/me/profile", requireAuth(auth), (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/me/profile", async (_req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const user = await prisma.user.findUnique({ where: { id: me }, select: profileSelect });
      if (!user) {
        res.status(404).json({ error: "not_found", message: "Perfil não encontrado." });
        return;
      }
      res.json(toProfile(user));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/me/profile", async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "validation_error",
          message: "Confira os campos destacados e tente de novo.",
          fields: jobFieldErrors(parsed.error),
        });
        return;
      }
      const { roles, headline, bio, city } = parsed.data;
      const preference = preferencesFromRoles(roles);
      const user = await prisma.$transaction(async (tx) => {
        await tx.userPreference.upsert({
          where: { userId: me },
          update: preference,
          create: { userId: me, ...preference },
        });
        return tx.user.update({ where: { id: me }, data: { headline, bio, city }, select: profileSelect });
      });
      res.json(toProfile(user));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
