import {
  createLocalPreferencesStore,
  createSecureKeyValueStore,
  createWebKeyValueStore,
  type StorageLike,
} from "@freelah/shared";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Web: localStorage (o SecureStore não funciona no navegador). Celular: SecureStore.
// A lógica e os testes vivem em @freelah/shared; aqui só se escolhe o armazenamento real.
const backend =
  Platform.OS === "web"
    ? createWebKeyValueStore(() => (globalThis as { localStorage?: StorageLike }).localStorage)
    : createSecureKeyValueStore(SecureStore);

/** Preferências de uso guardadas neste aparelho ou navegador (antes do login). */
export const localPreferences = createLocalPreferencesStore(backend);
