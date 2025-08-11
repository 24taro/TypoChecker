import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return `${chunkInfo.name}/index.js`
        },
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'popup/styles[extname]'
          }
          return 'assets/[name][extname]'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, './src/shared'),
    },
  },
  plugins: [
    {
      name: 'copy-files',
      closeBundle() {
        try {
          copyFileSync('public/manifest.json', 'dist/manifest.json')
          mkdirSync('dist/icons', { recursive: true })
          copyFileSync('public/icons/icon-16.png', 'dist/icons/icon-16.png')
          copyFileSync('public/icons/icon-32.png', 'dist/icons/icon-32.png')
          copyFileSync('public/icons/icon-48.png', 'dist/icons/icon-48.png')
          copyFileSync('public/icons/icon-128.png', 'dist/icons/icon-128.png')
          // HTMLファイルを正しい場所にコピー
          mkdirSync('dist/popup', { recursive: true })
          if (existsSync('dist/src/popup/index.html')) {
            copyFileSync('dist/src/popup/index.html', 'dist/popup/index.html')
            // 不要なディレクトリを削除
            rmSync('dist/src', { recursive: true, force: true })
          }
          console.log('Files copied successfully')
        } catch (error) {
          console.error('Error copying files:', error)
        }
      },
    },
  ],
})