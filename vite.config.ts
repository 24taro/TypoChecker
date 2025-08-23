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
        options: resolve(__dirname, 'src/options/options.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return `${chunkInfo.name}/index.js`
        },
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            if (assetInfo.name.includes('options')) {
              return 'options/styles[extname]'
            }
            return 'popup/styles[extname]'
          }
          return 'assets/[name][extname]'
        },
        // すべてのコードを単一のチャンクにバンドル（Service Worker対応）
        manualChunks: undefined,
      },
      external: [
        // Chrome extension APIは外部化
        'chrome'
      ],
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
          mkdirSync('dist/options', { recursive: true })
          if (existsSync('dist/src/popup/index.html')) {
            copyFileSync('dist/src/popup/index.html', 'dist/popup/index.html')
          }
          if (existsSync('dist/src/options/options.html')) {
            copyFileSync('dist/src/options/options.html', 'dist/options/options.html')
          }
          // 不要なディレクトリを削除
          if (existsSync('dist/src')) {
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