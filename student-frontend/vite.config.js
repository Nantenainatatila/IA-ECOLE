import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : indispensable pour que le build fonctionne en file:// dans Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
