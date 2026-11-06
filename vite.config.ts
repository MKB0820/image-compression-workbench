import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    // Vite 默认是 'iife'，模块 worker（含 import）构建后可能加载失败
    format: 'es',
  },
  build: {
    // Tailwind v4 与 createImageBitmap 的 from-image 语义共同决定的下限
    target: ['chrome111', 'edge111', 'firefox128', 'safari17'],
  },
})
