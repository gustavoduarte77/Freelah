import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./api";

/**
 * Cliente do Better Auth. Na Web a sessão é um cookie (por isso "include"); no celular o plugin
 * guarda o cookie no SecureStore e o envia nas chamadas.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: "include" },
  plugins: [
    expoClient({ scheme: "freelah", storagePrefix: "freelah", storage: SecureStore }),
    inferAdditionalFields({
      user: {
        phone: { type: "string", required: true },
        city: { type: "string", required: true },
        // Só existe no envio do cadastro: o servidor valida e registra a data da declaração (18+).
        adultConfirmed: { type: "boolean", required: false },
      },
    }),
  ],
});
