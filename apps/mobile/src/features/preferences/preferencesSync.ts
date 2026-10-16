import { createPreferencesSyncController } from "@freelah/shared";
import { localPreferences } from "./localPreferences";
import { preferencesApi } from "./preferencesApi";

/** Controlador único do app: sobrevive a remontagens de telas e é ligado à sessão pelo provider. */
export const preferencesSync = createPreferencesSyncController({
  api: preferencesApi,
  local: localPreferences,
});
