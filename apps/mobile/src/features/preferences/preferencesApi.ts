import { createPreferencesApi } from "@freelah/shared";
import { API_URL, authenticatedFetch } from "../../lib/authenticatedFetch";

export const preferencesApi = createPreferencesApi({ baseUrl: API_URL, fetch: authenticatedFetch });
