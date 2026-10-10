import type { MeResponse } from "@freelah/shared";
import { Router } from "express";
import type { Auth } from "../auth";
import { getSession, requireAuth } from "../middleware/require-auth";

/** GET /me: perfil do próprio usuário. O telefone só é devolvido ao dono da conta. */
export function createMeRouter(auth: Auth): Router {
  const router = Router();

  router.get("/me", requireAuth(auth), (_req, res) => {
    const { user } = getSession(res);
    const body: MeResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      city: user.city,
      avatarUrl: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
    };
    res.json(body);
  });

  return router;
}
