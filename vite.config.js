import { defineConfig } from "vite";

// Cross-origin isolation habilita SharedArrayBuffer, que usan los núcleos multihilo de EmulatorJS.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  // Sin fallback de SPA: el loader de EmulatorJS pide emulator.min.css/.js (que el paquete npm no trae)
  // y solo cae a los archivos sin minificar si recibe un 404, no index.html.
  appType: "mpa",
  server: { port: 5280, strictPort: true, headers: isolation },
  preview: { port: 5280, strictPort: true, headers: isolation },
});
