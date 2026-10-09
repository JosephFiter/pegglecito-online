import { defineConfig } from 'vite';

// Puerto propio: el 5173 suele estar "ocupado" en el navegador por service workers
// de otros proyectos de Vite, que devuelven su propio HTML cacheado.
export default defineConfig({
  server: { port: 5280, strictPort: true },
});
