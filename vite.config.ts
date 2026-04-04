import path from 'node:path'
import { defineConfig, createLogger } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'

const logger = createLogger()
const loggerInfo = logger.info
logger.info = (msg, options) => {
  loggerInfo(msg.replace('http://localhost:3001', 'https://localhost:3000'), options)
}

const config = defineConfig({
  customLogger: logger,
  server: {
    port: 3001,
    strictPort: true,
    hmr: {
      // Caddy proxies https://localhost:3000 → localhost:3001
      // Tell the HMR client to connect back through Caddy
      protocol: 'wss',
      host: 'localhost',
      clientPort: 3000,
    },
  },
  plugins: [
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@tanstack/router-core/scroll-restoration-script': path.resolve(
        'node_modules/@tanstack/router-core/dist/esm/scroll-restoration-script/client.js',
      ),
    },
  },
})

export default config
