import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Public distribution build (`npm run build:public`): the bundled real-world database
 * (EA SPORTS FC 26 attributes, crests, photos) is removed from the output, and the app
 * neither fetches it nor loads third-party crests/photos (VITE_PUBLIC_BUILD=1).
 */
function stripThirdPartyData(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pitchside-strip-third-party-data',
    apply: 'build',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      rmSync(resolve(outDir, 'data'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'public' ? [stripThirdPartyData()] : [])],
  server: { port: 5173 },
}));
