import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { seoStaticContent } from './seo.config.ts'
import { execSync } from 'node:child_process'

// The web's "app version" in the member page history (lib/pageTracker.ts): the build date and the
// commit it was built from, e.g. 2026.11.03+c2eebb5. The web has no release numbers of its own.
function buildId(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
  try {
    return day + '+' + execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return day
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoStaticContent()],
  define: { __APP_BUILD__: JSON.stringify(buildId()) },
})
