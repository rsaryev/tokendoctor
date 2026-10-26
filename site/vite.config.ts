import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The landing for tokendoctor.dev: the Localix landing's shell, standalone.
export default defineConfig({
  server: { port: 5173 },
  preview: { port: 5174 },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
})
