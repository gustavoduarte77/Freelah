import { URL, fileURLToPath } from "node:url";

// Testes do Modo Demonstração: rodam em Node, então `expo-router` (importado só para atualizar telas)
// é trocado por um substituto vazio.
export default {
  resolve: {
    alias: {
      "expo-router": fileURLToPath(new URL("./src/demo/test/expo-router.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: [fileURLToPath(new URL("./src/demo/test/local-storage.ts", import.meta.url))],
  },
};
