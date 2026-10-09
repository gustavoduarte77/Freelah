import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createApp(config);

// Escuta em todas as interfaces para que o Expo Go (celular na mesma rede) consiga acessar.
app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Freelah API em http://localhost:${config.PORT} (${config.NODE_ENV})`);
});
