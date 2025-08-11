# Chrome拡張機能「TypoChecker」技術構成書

## 1. エグゼクティブサマリー

### 1.1 プロジェクト概要
Chrome内蔵AI（Gemini Nano）を活用して、Webページ全体のタイポ・文法・日本語の問題を検出するChrome拡張機能。プライバシーを保護しながらローカルでAI処理を実行。

### 1.2 技術的制約と解決策
- **Gemini Nanoトークン制限**: 6,144トークン（約24,576文字）
- **解決策**: CAG（Chunked Augmented Generation）パターンによるテキスト分割処理
- **Content Script制約**: Chrome AI APIへの直接アクセス不可
- **解決策**: Service Workerを介したメッセージパッシング

## 2. アーキテクチャ概要

### 2.1 コンポーネント構成
```
┌─────────────────────────────────────────────────────────────┐
│                        Web Page (DOM)                        │
└─────────────────────────────────────────────────────────────┘
                               ↑
                    [1. DOM Access & Text Extraction]
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                      Content Script                          │
│  - DOM traversal & text extraction                          │
│  - Hidden content detection                                 │
│  - Text chunking preparation                                │
└─────────────────────────────────────────────────────────────┘
                               ↓
                    [2. Message Passing (chrome.runtime)]
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                  Service Worker (Background)                 │
│  - Chrome AI API access                                     │
│  - Chunk processing orchestration                           │
│  - Session management                                       │
└─────────────────────────────────────────────────────────────┘
                               ↓
                    [3. AI Processing (Gemini Nano)]
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                        Popup UI                              │
│  - Results display                                          │
│  - User interaction                                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 データフロー
1. ユーザーがPopup UIで「ページをチェック」をクリック
2. Content Scriptがページ全体のテキストを抽出
3. Service Workerがテキストをチャンクに分割
4. 各チャンクをGemini Nanoで解析
5. 結果を集約してPopup UIに表示

## 3. プロジェクト構造

```
TypoChecker/
├── src/
│   ├── background/
│   │   ├── index.ts              # Service Worker エントリーポイント
│   │   ├── ai-session.ts         # Chrome AI API セッション管理
│   │   ├── chunk-processor.ts    # テキストチャンク処理
│   │   └── message-handler.ts    # メッセージ処理
│   │
│   ├── content/
│   │   ├── index.ts              # Content Script エントリーポイント
│   │   ├── dom-extractor.ts      # DOM解析とテキスト抽出
│   │   ├── text-processor.ts     # テキスト前処理
│   │   └── chunk-splitter.ts     # テキスト分割ロジック
│   │
│   ├── popup/
│   │   ├── index.html            # ポップアップUI
│   │   ├── index.ts              # UIロジック
│   │   ├── components/           # UIコンポーネント
│   │   │   ├── error-list.ts     # エラーリスト表示
│   │   │   ├── error-detail.ts   # エラー詳細表示
│   │   │   └── progress-bar.ts   # 処理進捗表示
│   │   └── styles.css            # スタイルシート
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   ├── chrome-ai.d.ts    # Chrome AI API型定義
│   │   │   ├── messages.ts       # メッセージ型定義
│   │   │   └── analysis.ts       # 解析結果型定義
│   │   ├── constants.ts          # 定数定義
│   │   └── utils.ts              # 共通ユーティリティ
│   │
│   └── lib/
│       ├── chunking/
│       │   └── recursive-splitter.ts  # CAGベースのテキスト分割
│       └── storage/
│           └── cache-manager.ts       # 結果キャッシュ管理
│
├── public/
│   ├── manifest.json             # Chrome拡張マニフェスト
│   └── icons/                    # アイコンファイル
│
├── tests/                        # テストファイル
├── package.json                  # 依存関係
├── tsconfig.json                # TypeScript設定
├── biome.json                   # Biome設定
└── vite.config.ts               # Viteビルド設定
```

## 4. Manifest V3設定

### 4.1 manifest.json
```json
{
  "manifest_version": 3,
  "name": "TypoChecker - AI-Powered Page Analyzer",
  "version": "1.0.0",
  "description": "Chrome内蔵AIでページ全体のタイポ・文法をチェック",
  
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs"
  ],
  
  "host_permissions": [
    "<all_urls>"
  ],
  
  "background": {
    "service_worker": "dist/background/index.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "dist/popup/index.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content/index.js"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
  
  "minimum_chrome_version": "138",
  
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'"
  }
}
```

## 5. コア実装設計

### 5.1 テキスト抽出戦略 (content/dom-extractor.ts)
```typescript
interface DOMExtractor {
  // 可視テキストと非表示テキストの両方を抽出
  extractAllText(): ExtractedContent
  // メタデータも含めて抽出
  extractMetadata(): PageMetadata
  // 構造化されたテキストブロックとして抽出
  extractStructuredBlocks(): TextBlock[]
}

interface ExtractedContent {
  visibleText: string[]      // innerTextで取得
  hiddenText: string[]       // display:none等の要素
  altTexts: string[]         // 画像のalt属性
  metaContent: string[]      // metaタグのcontent
  jsonLdData: any[]         // JSON-LD構造化データ
}

interface TextBlock {
  text: string
  xpath: string              // 元の位置を特定するため
  isVisible: boolean
  elementType: string
  contextBefore?: string     // 前後の文脈
  contextAfter?: string
}
```

### 5.2 チャンク分割戦略 (lib/chunking/recursive-splitter.ts)
```typescript
class RecursiveTextSplitter {
  private readonly chunkSize = 5000        // 文字数（トークン制限を考慮）
  private readonly chunkOverlap = 200      // チャンク間のオーバーラップ
  
  splitText(text: string): Chunk[] {
    // 1. 段落・文章単位で分割を試みる
    // 2. 文脈を保持するためオーバーラップを設定
    // 3. 各チャンクにメタデータを付与
  }
}

interface Chunk {
  id: string
  text: string
  startIndex: number
  endIndex: number
  metadata: {
    pageUrl: string
    chunkIndex: number
    totalChunks: number
  }
}
```

### 5.3 AI処理実装 (background/ai-session.ts)
```typescript
class AISessionManager {
  private session: any // Chrome AI Session
  private readonly MAX_RETRIES = 3
  
  async initialize(): Promise<void> {
    const availability = await chrome.ai.languageModel.availability()
    
    if (availability === 'readily') {
      this.session = await chrome.ai.languageModel.create({
        systemPrompt: this.getSystemPrompt(),
        temperature: 0.3,  // 低めの温度で一貫性を重視
        topK: 3
      })
    } else if (availability === 'after-download') {
      // モデルのダウンロードを待つ
      await this.waitForModelDownload()
    } else {
      throw new Error('Chrome AI is not available')
    }
  }
  
  private getSystemPrompt(): string {
    return `あなたは日本語のタイポ、文法エラー、不自然な表現を検出する専門家です。
            以下の形式でエラーを報告してください：
            {
              "errors": [
                {
                  "type": "typo|grammar|japanese",
                  "severity": "error|warning|info",
                  "original": "元のテキスト",
                  "suggestion": "修正案",
                  "explanation": "エラーの説明"
                }
              ]
            }`
  }
  
  async analyzeChunk(chunk: Chunk): Promise<AnalysisResult> {
    const prompt = `次のテキストを分析してください：\n\n${chunk.text}`
    
    try {
      const response = await this.session.prompt(prompt)
      return this.parseResponse(response, chunk)
    } catch (error) {
      // トークン制限エラーの場合は、チャンクを更に分割
      if (error.name === 'QuotaExceededError') {
        return this.analyzeWithSmallerChunks(chunk)
      }
      throw error
    }
  }
  
  getTokenUsage(): TokenUsage {
    return {
      used: this.session.tokensUsed,
      remaining: this.session.tokensRemaining,
      max: this.session.maxTokens
    }
  }
}
```

### 5.4 メッセージパッシング (shared/types/messages.ts)
```typescript
// Content Script → Service Worker
interface ExtractTextMessage {
  type: 'EXTRACT_TEXT'
  data: {
    url: string
    content: ExtractedContent
  }
}

// Service Worker → Content Script
interface AnalysisCompleteMessage {
  type: 'ANALYSIS_COMPLETE'
  data: {
    results: AnalysisResult[]
    stats: AnalysisStats
  }
}

// Popup → Service Worker
interface StartAnalysisMessage {
  type: 'START_ANALYSIS'
  tabId: number
}

// Service Worker → Popup
interface ProgressUpdateMessage {
  type: 'PROGRESS_UPDATE'
  data: {
    current: number
    total: number
    phase: 'extracting' | 'analyzing' | 'complete'
  }
}
```

## 6. UI設計

### 6.1 ポップアップUI構成
```html
<!-- popup/index.html -->
<div class="typochecker-popup">
  <header>
    <h1>TypoChecker</h1>
    <div class="status-indicator"></div>
  </header>
  
  <main>
    <!-- 分析開始セクション -->
    <section class="analyze-section">
      <button id="analyze-btn" class="primary-btn">
        ページをチェック
      </button>
      <div class="progress-container hidden">
        <div class="progress-bar"></div>
        <span class="progress-text">0/0 チャンク処理中...</span>
      </div>
    </section>
    
    <!-- エラーサマリー -->
    <section class="summary-section hidden">
      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">タイポ</span>
          <span class="stat-value typo-count">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">文法</span>
          <span class="stat-value grammar-count">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">日本語</span>
          <span class="stat-value japanese-count">0</span>
        </div>
      </div>
    </section>
    
    <!-- エラーリスト -->
    <section class="errors-section hidden">
      <div class="filter-tabs">
        <button class="tab active" data-filter="all">すべて</button>
        <button class="tab" data-filter="typo">タイポ</button>
        <button class="tab" data-filter="grammar">文法</button>
        <button class="tab" data-filter="japanese">日本語</button>
      </div>
      
      <div class="error-list">
        <!-- 動的に生成 -->
      </div>
    </section>
    
    <!-- エラー詳細モーダル -->
    <div class="error-detail-modal hidden">
      <div class="modal-content">
        <h3>エラー詳細</h3>
        <div class="error-context"></div>
        <div class="suggestion-box">
          <button class="copy-btn">修正案をコピー</button>
        </div>
      </div>
    </div>
  </main>
  
  <footer>
    <button class="export-btn">結果をエクスポート</button>
    <button class="settings-btn">設定</button>
  </footer>
</div>
```

### 6.2 UIスタイル設計
- **サイズ**: 450px × 600px（最大高さ）
- **カラースキーム**: 
  - エラー: #dc3545
  - 警告: #ffc107  
  - 情報: #17a2b8
  - 成功: #28a745
- **フォント**: システムフォント優先
- **レスポンシブ**: スクロール可能なエラーリスト

## 7. パフォーマンス最適化

### 7.1 チャンク処理の最適化
```typescript
class ChunkProcessor {
  private readonly BATCH_SIZE = 3  // 並列処理するチャンク数
  
  async processChunks(chunks: Chunk[]): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = []
    
    // バッチ処理で効率化
    for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
      const batch = chunks.slice(i, i + this.BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(chunk => this.analyzeChunk(chunk))
      )
      results.push(...batchResults)
      
      // 進捗を通知
      this.notifyProgress(i + batch.length, chunks.length)
    }
    
    return results
  }
}
```

### 7.2 キャッシュ戦略
```typescript
class CacheManager {
  private readonly CACHE_DURATION = 30 * 60 * 1000  // 30分
  
  async getCachedResult(url: string): Promise<AnalysisResult | null> {
    const cached = await chrome.storage.local.get(url)
    if (cached && cached[url]) {
      const { timestamp, result } = cached[url]
      if (Date.now() - timestamp < this.CACHE_DURATION) {
        return result
      }
    }
    return null
  }
  
  async cacheResult(url: string, result: AnalysisResult): Promise<void> {
    await chrome.storage.local.set({
      [url]: {
        timestamp: Date.now(),
        result
      }
    })
  }
}
```

## 8. エラーハンドリング

### 8.1 エラータイプと対処
```typescript
enum ErrorType {
  AI_UNAVAILABLE = 'AI_UNAVAILABLE',
  TOKEN_LIMIT_EXCEEDED = 'TOKEN_LIMIT_EXCEEDED',
  MODEL_DOWNLOAD_REQUIRED = 'MODEL_DOWNLOAD_REQUIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED'
}

class ErrorHandler {
  handle(error: Error): UserMessage {
    switch (error.name) {
      case 'NotSupportedError':
        return {
          type: 'error',
          message: 'お使いのChromeバージョンはAI機能に対応していません。Chrome 138以降にアップデートしてください。'
        }
      
      case 'QuotaExceededError':
        return {
          type: 'warning',
          message: 'テキストが長すぎます。自動的に分割して処理します。'
        }
      
      case 'ModelDownloadRequired':
        return {
          type: 'info',
          message: 'AI モデルをダウンロード中です。しばらくお待ちください。'
        }
      
      default:
        return {
          type: 'error',
          message: '予期しないエラーが発生しました。'
        }
    }
  }
}
```

## 9. セキュリティ考慮事項

### 9.1 Content Security Policy
- インラインスクリプトの禁止
- 外部リソースの制限
- eval()の使用禁止

### 9.2 データプライバシー
- すべての処理はローカルで実行
- 外部サーバーへのデータ送信なし
- 機密情報の自動検出とマスキング

### 9.3 権限の最小化
- 必要最小限の権限のみ要求
- activeTabで現在のタブのみアクセス

## 10. 開発環境設定

### 10.1 package.json
```json
{
  "name": "typochecker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "format": "biome format --write ./src",
    "lint": "biome lint ./src",
    "check": "biome check --apply ./src",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:ui": "vitest --ui"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.8.3",
    "@types/chrome": "^0.0.268",
    "@types/node": "^20.14.0",
    "typescript": "^5.5.4",
    "vite": "^5.3.5",
    "vitest": "^2.0.0"
  }
}
```

### 10.2 TypeScript設定 (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@shared/*": ["shared/*"],
      "@lib/*": ["lib/*"]
    },
    "types": ["chrome", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 10.3 Biome設定 (biome.json)
```json
{
  "$schema": "https://biomejs.dev/schemas/1.8.3/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noForEach": "off",
        "noBannedTypes": "off"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error",
        "useTemplate": "error",
        "noVar": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noImplicitAnyLet": "error"
      },
      "correctness": {
        "noUnusedVariables": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "semicolons": "asNeeded",
      "trailingComma": "es5",
      "arrowParentheses": "always"
    }
  },
  "files": {
    "ignore": [
      "dist",
      "node_modules",
      "*.min.js",
      "coverage",
      ".vite"
    ]
  }
}
```

## 11. テスト戦略

### 11.1 単体テスト
```typescript
// tests/chunking.test.ts
describe('RecursiveTextSplitter', () => {
  it('should split text within token limits', () => {
    const splitter = new RecursiveTextSplitter()
    const text = 'a'.repeat(10000)
    const chunks = splitter.splitText(text)
    
    expect(chunks.every(c => c.text.length <= 5000)).toBe(true)
  })
  
  it('should maintain context overlap', () => {
    const splitter = new RecursiveTextSplitter()
    const chunks = splitter.splitText(longText)
    
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i-1].text.slice(-200)
      const currentStart = chunks[i].text.slice(0, 200)
      expect(prevEnd).toContain(currentStart.slice(0, 100))
    }
  })
})
```

### 11.2 統合テスト
- Chrome拡張機能のロードテスト
- メッセージパッシングのテスト
- AI API モックを使用した解析テスト

## 12. デプロイメント

### 12.1 ビルドプロセス
```bash
# 開発ビルド
npm run dev

# プロダクションビルド
npm run build

# Chrome拡張パッケージ作成
npm run package
```

### 12.2 Chrome Web Store提出準備
1. プライバシーポリシーの作成
2. スクリーンショットの準備
3. 詳細な説明文の作成
4. バージョン管理

## 13. 今後の拡張計画

### Phase 1 (MVP)
- 基本的なタイポ検出
- シンプルなUI
- 日本語サポート

### Phase 2
- 多言語サポート
- より高度な文法チェック
- 修正の自動適用

### Phase 3
- カスタムルールの設定
- チーム共有機能
- 統計ダッシュボード

---

*作成日: 2025年8月11日*
*最終更新: リサーチに基づく包括的な設計*