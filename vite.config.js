import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/wiener-process-non-differentiable/', // <-- 確保前後都有斜線 /
})