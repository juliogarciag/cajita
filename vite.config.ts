import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'

function printPublicUrl(): Plugin {
  return {
    name: 'print-public-url',
    configureServer(server) {
      const _printUrls = server.printUrls.bind(server)
      server.printUrls = () => {
        _printUrls()
        server.config.logger.info(
          '  \x1b[32m➜\x1b[0m  \x1b[1mPublic:\x1b[0m  \x1b[36mhttps://localhost:3000/\x1b[0m \x1b[2m(via Caddy)\x1b[0m',
        )
      }
    },
  }
}

const config = defineConfig({
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
    printPublicUrl(),
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
