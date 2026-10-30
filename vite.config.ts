import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { seoStaticContent } from './seo.config.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoStaticContent()],
})
