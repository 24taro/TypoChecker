# TypoChecker 実装ガイド

## 前提知識と重要な制約

### Chrome拡張機能の3つの実行コンテキスト
1. **Content Script**: Webページと同じコンテキストで実行、DOMアクセス可能、Chrome API制限あり
2. **Service Worker (Background)**: 拡張機能のバックグラウンド処理、全Chrome APIアクセス可能
3. **Extension Pages (Popup/Options)**: 拡張機能のUIページ、全Chrome APIアクセス可能

### Chrome AI APIの制約
- **アクセス可能**: Service Worker、Extension Pages
- **アクセス不可**: Content Script
- **トークン制限**: 6,144トークン（約24,576文字）

## ステップバイステップ実装

### Step 1: テキスト抽出の実装

```typescript
// src/content/dom-extractor.ts
class DOMExtractor {
  extractAllText(): ExtractedContent {
    const content: ExtractedContent = {
      visibleText: [],
      hiddenText: [],
      metadata: []
    }
    
    // 1. 可視テキストの取得
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          
          // 非表示要素をチェック
          const style = window.getComputedStyle(parent)
          const isHidden = style.display === 'none' || 
                          style.visibility === 'hidden'
          
          if (isHidden) {
            content.hiddenText.push(node.textContent?.trim() || '')
            return NodeFilter.FILTER_REJECT
          }
          
          // スクリプトやスタイルタグを除外
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT
          }
          
          return NodeFilter.FILTER_ACCEPT
        }
      }
    )
    
    let node
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim()
      if (text && text.length > 0) {
        content.visibleText.push(text)
      }
    }
    
    // 2. メタデータの取得
    document.querySelectorAll('meta[content]').forEach(meta => {
      const content = meta.getAttribute('content')
      if (content) {
        content.metadata.push(content)
      }
    })
    
    // 3. 画像のalt属性
    document.querySelectorAll('img[alt]').forEach(img => {
      const alt = img.getAttribute('alt')
      if (alt) {
        content.metadata.push(alt)
      }
    })
    
    return content
  }
}
```

### Step 2: チャンク分割の実装

```typescript
// src/lib/chunking/text-splitter.ts
class TextSplitter {
  private readonly MAX_CHUNK_SIZE = 5000  // 文字数
  private readonly OVERLAP_SIZE = 200
  
  splitText(text: string): Chunk[] {
    const chunks: Chunk[] = []
    
    // 句読点で文を分割
    const sentences = this.splitBySentences(text)
    
    let currentChunk = ''
    let chunkIndex = 0
    
    for (const sentence of sentences) {
      // チャンクサイズを超える場合
      if (currentChunk.length + sentence.length > this.MAX_CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push({
            id: `chunk-${chunkIndex}`,
            text: currentChunk,
            index: chunkIndex++
          })
          
          // オーバーラップ部分を次のチャンクに含める
          const overlapText = this.getOverlapText(currentChunk)
          currentChunk = overlapText + sentence
        } else {
          // 単一の文がチャンクサイズを超える場合
          currentChunk = sentence.substring(0, this.MAX_CHUNK_SIZE)
        }
      } else {
        currentChunk += sentence
      }
    }
    
    // 最後のチャンク
    if (currentChunk) {
      chunks.push({
        id: `chunk-${chunkIndex}`,
        text: currentChunk,
        index: chunkIndex
      })
    }
    
    return chunks
  }
  
  private splitBySentences(text: string): string[] {
    // 日本語の句読点も考慮
    return text.match(/[^。！？\.!?]+[。！？\.!?]+/g) || [text]
  }
  
  private getOverlapText(text: string): string {
    const sentences = this.splitBySentences(text)
    let overlap = ''
    
    for (let i = sentences.length - 1; i >= 0; i--) {
      if (overlap.length + sentences[i].length <= this.OVERLAP_SIZE) {
        overlap = sentences[i] + overlap
      } else {
        break
      }
    }
    
    return overlap
  }
}
```

### Step 3: Chrome AI APIの初期化と使用

```typescript
// src/background/ai-manager.ts
class AIManager {
  private session: any = null
  private isInitializing = false
  
  async ensureSession(): Promise<void> {
    if (this.session || this.isInitializing) return
    
    this.isInitializing = true
    
    try {
      // 1. 利用可能性をチェック
      const capabilities = await ai.languageModel.capabilities()
      console.log('AI Capabilities:', capabilities)
      
      if (capabilities.available === 'no') {
        throw new Error('Chrome AI is not available')
      }
      
      // 2. モデルのダウンロードが必要な場合
      if (capabilities.available === 'after-download') {
        console.log('Downloading AI model...')
        
        // ダウンロード進捗を監視
        this.session = await ai.languageModel.create({
          monitor(m) {
            m.addEventListener('downloadprogress', (e) => {
              console.log(`Download progress: ${e.loaded}/${e.total}`)
              // Popup UIに進捗を通知
              chrome.runtime.sendMessage({
                type: 'MODEL_DOWNLOAD_PROGRESS',
                progress: (e.loaded / e.total) * 100
              })
            })
          }
        })
      } else {
        // 3. セッションを作成
        this.session = await ai.languageModel.create({
          systemPrompt: `あなたは日本語の文章チェッカーです。
                        タイポ、文法エラー、不自然な日本語を検出してください。
                        以下のJSON形式で応答してください：
                        {
                          "errors": [
                            {
                              "type": "typo|grammar|japanese",
                              "text": "問題のあるテキスト",
                              "suggestion": "修正案",
                              "severity": "error|warning|info",
                              "explanation": "問題の説明"
                            }
                          ]
                        }`,
          temperature: 0.3,
          topK: 3
        })
      }
      
      console.log('AI session created successfully')
      console.log(`Max tokens: ${this.session.maxTokens}`)
      
    } catch (error) {
      console.error('Failed to initialize AI:', error)
      throw error
    } finally {
      this.isInitializing = false
    }
  }
  
  async analyzeText(text: string): Promise<AnalysisResult> {
    await this.ensureSession()
    
    const prompt = `次のテキストをチェックしてください：\n\n${text}`
    
    try {
      // トークン使用量をチェック
      if (this.session.countPromptTokens(prompt) > this.session.tokensRemaining) {
        throw new Error('Text too long for remaining tokens')
      }
      
      const response = await this.session.prompt(prompt)
      
      // レスポンスをパース
      try {
        const parsed = JSON.parse(response)
        return {
          errors: parsed.errors || [],
          tokensUsed: this.session.tokensSoFar
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', response)
        return { errors: [], tokensUsed: 0 }
      }
      
    } catch (error) {
      if (error.message.includes('too long')) {
        // テキストが長すぎる場合は、より小さいチャンクに分割
        console.log('Text too long, need smaller chunks')
        throw new Error('NEED_SMALLER_CHUNKS')
      }
      throw error
    }
  }
  
  async destroy(): Promise<void> {
    if (this.session) {
      this.session.destroy()
      this.session = null
    }
  }
}
```

### Step 4: メッセージハンドリング

```typescript
// src/background/message-handler.ts
class MessageHandler {
  private aiManager = new AIManager()
  private textSplitter = new TextSplitter()
  
  constructor() {
    this.setupListeners()
  }
  
  private setupListeners(): void {
    // Popup UIからのメッセージ
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'START_ANALYSIS') {
        this.handleStartAnalysis(message.tabId)
          .then(sendResponse)
          .catch(error => sendResponse({ error: error.message }))
        return true  // 非同期レスポンスのため
      }
    })
  }
  
  private async handleStartAnalysis(tabId: number): Promise<void> {
    try {
      // 1. Content Scriptを注入
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.extractPageContent
      })
      
      // 2. Content Scriptからのレスポンスを待つ
      return new Promise((resolve, reject) => {
        const listener = (message: any, sender: any) => {
          if (sender.tab?.id === tabId && message.type === 'PAGE_CONTENT') {
            chrome.runtime.onMessage.removeListener(listener)
            
            // 3. テキストを解析
            this.analyzeContent(message.data)
              .then(resolve)
              .catch(reject)
          }
        }
        chrome.runtime.onMessage.addListener(listener)
        
        // タイムアウト設定
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener)
          reject(new Error('Content extraction timeout'))
        }, 10000)
      })
      
    } catch (error) {
      console.error('Analysis failed:', error)
      throw error
    }
  }
  
  private extractPageContent(): void {
    // この関数はContent Scriptコンテキストで実行される
    const extractor = new DOMExtractor()
    const content = extractor.extractAllText()
    
    // Background Service Workerに送信
    chrome.runtime.sendMessage({
      type: 'PAGE_CONTENT',
      data: {
        url: window.location.href,
        title: document.title,
        content: content
      }
    })
  }
  
  private async analyzeContent(data: any): Promise<void> {
    const allText = [
      ...data.content.visibleText,
      ...data.content.hiddenText,
      ...data.content.metadata
    ].join('\n')
    
    // チャンクに分割
    const chunks = this.textSplitter.splitText(allText)
    console.log(`Split into ${chunks.length} chunks`)
    
    const results: AnalysisResult[] = []
    
    // バッチ処理
    const BATCH_SIZE = 3
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, Math.min(i + BATCH_SIZE, chunks.length))
      
      // 進捗を通知
      chrome.runtime.sendMessage({
        type: 'ANALYSIS_PROGRESS',
        current: i,
        total: chunks.length
      })
      
      // 並列処理
      const batchResults = await Promise.allSettled(
        batch.map(chunk => this.aiManager.analyzeText(chunk.text))
      )
      
      // 結果を収集
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          console.error(`Chunk ${i + index} failed:`, result.reason)
        }
      })
    }
    
    // 結果を集約してPopupに送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: {
        url: data.url,
        results: this.aggregateResults(results)
      }
    })
  }
  
  private aggregateResults(results: AnalysisResult[]): any {
    const allErrors = results.flatMap(r => r.errors || [])
    
    // 重複を除去
    const uniqueErrors = this.removeDuplicates(allErrors)
    
    // タイプ別に分類
    const categorized = {
      typo: uniqueErrors.filter(e => e.type === 'typo'),
      grammar: uniqueErrors.filter(e => e.type === 'grammar'),
      japanese: uniqueErrors.filter(e => e.type === 'japanese')
    }
    
    return {
      total: uniqueErrors.length,
      errors: uniqueErrors,
      categorized
    }
  }
  
  private removeDuplicates(errors: any[]): any[] {
    const seen = new Set()
    return errors.filter(error => {
      const key = `${error.text}-${error.type}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }
}
```

### Step 5: Popup UIの実装

```typescript
// src/popup/index.ts
class PopupUI {
  private analyzeBtn: HTMLButtonElement
  private progressBar: HTMLElement
  private errorList: HTMLElement
  
  constructor() {
    this.analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement
    this.progressBar = document.querySelector('.progress-container') as HTMLElement
    this.errorList = document.querySelector('.error-list') as HTMLElement
    
    this.setupEventListeners()
    this.setupMessageListeners()
  }
  
  private setupEventListeners(): void {
    this.analyzeBtn.addEventListener('click', () => this.startAnalysis())
    
    // フィルタータブ
    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const filter = (e.target as HTMLElement).dataset.filter
        this.filterErrors(filter)
      })
    })
  }
  
  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case 'ANALYSIS_PROGRESS':
          this.updateProgress(message.current, message.total)
          break
          
        case 'ANALYSIS_COMPLETE':
          this.displayResults(message.data)
          break
          
        case 'MODEL_DOWNLOAD_PROGRESS':
          this.showDownloadProgress(message.progress)
          break
      }
    })
  }
  
  private async startAnalysis(): Promise<void> {
    // 現在のタブを取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    
    if (!tab.id) {
      this.showError('タブの取得に失敗しました')
      return
    }
    
    // UIを更新
    this.analyzeBtn.disabled = true
    this.progressBar.classList.remove('hidden')
    this.errorList.innerHTML = ''
    
    // 解析を開始
    chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      tabId: tab.id
    })
  }
  
  private updateProgress(current: number, total: number): void {
    const percentage = (current / total) * 100
    const progressBar = this.progressBar.querySelector('.progress-bar') as HTMLElement
    const progressText = this.progressBar.querySelector('.progress-text') as HTMLElement
    
    progressBar.style.width = `${percentage}%`
    progressText.textContent = `${current}/${total} チャンク処理中...`
  }
  
  private displayResults(data: any): void {
    // プログレスバーを隠す
    this.progressBar.classList.add('hidden')
    this.analyzeBtn.disabled = false
    
    // サマリーを更新
    const summary = document.querySelector('.summary-section')
    if (summary) {
      summary.classList.remove('hidden')
      summary.querySelector('.typo-count')!.textContent = data.categorized.typo.length
      summary.querySelector('.grammar-count')!.textContent = data.categorized.grammar.length
      summary.querySelector('.japanese-count')!.textContent = data.categorized.japanese.length
    }
    
    // エラーリストを表示
    const errorsSection = document.querySelector('.errors-section')
    if (errorsSection) {
      errorsSection.classList.remove('hidden')
    }
    
    // エラーをレンダリング
    this.renderErrors(data.errors)
  }
  
  private renderErrors(errors: any[]): void {
    this.errorList.innerHTML = errors.map((error, index) => `
      <div class="error-item ${error.severity}" data-type="${error.type}" data-index="${index}">
        <div class="error-header">
          <span class="error-type">${this.getTypeLabel(error.type)}</span>
          <span class="error-severity">${this.getSeverityLabel(error.severity)}</span>
        </div>
        <div class="error-text">${this.escapeHtml(error.text)}</div>
        <div class="error-suggestion">
          修正案: ${this.escapeHtml(error.suggestion)}
        </div>
        <div class="error-actions">
          <button class="copy-btn" data-text="${this.escapeHtml(error.suggestion)}">
            コピー
          </button>
          <button class="detail-btn" data-index="${index}">
            詳細
          </button>
        </div>
      </div>
    `).join('')
    
    // コピーボタンのイベント
    this.errorList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = (e.target as HTMLElement).dataset.text
        if (text) {
          navigator.clipboard.writeText(text)
          this.showToast('コピーしました')
        }
      })
    })
  }
  
  private filterErrors(filter: string | undefined): void {
    const items = this.errorList.querySelectorAll('.error-item')
    
    items.forEach(item => {
      const itemType = (item as HTMLElement).dataset.type
      if (filter === 'all' || filter === itemType) {
        (item as HTMLElement).style.display = 'block'
      } else {
        (item as HTMLElement).style.display = 'none'
      }
    })
    
    // タブのアクティブ状態を更新
    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      if ((tab as HTMLElement).dataset.filter === filter) {
        tab.classList.add('active')
      } else {
        tab.classList.remove('active')
      }
    })
  }
  
  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      typo: 'タイポ',
      grammar: '文法',
      japanese: '日本語'
    }
    return labels[type] || type
  }
  
  private getSeverityLabel(severity: string): string {
    const labels: Record<string, string> = {
      error: 'エラー',
      warning: '警告',
      info: '情報'
    }
    return labels[severity] || severity
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
  
  private showError(message: string): void {
    // エラー表示の実装
    console.error(message)
  }
  
  private showToast(message: string): void {
    // トースト通知の実装
    console.log(message)
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  new PopupUI()
})
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. "AI not available" エラー
```javascript
// Chrome バージョンをチェック
const version = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]
if (parseInt(version || '0') < 138) {
  console.error('Chrome 138以降が必要です')
}

// フラグが有効か確認
// chrome://flags で以下を確認:
// - "Prompt API for Gemini Nano" → Enabled
// - "Enables optimization guide on device" → Enabled
```

#### 2. トークン制限エラー
```javascript
// セッションをリセット
if (error.name === 'QuotaExceededError') {
  await aiManager.destroy()
  await aiManager.ensureSession()
  // より小さいチャンクで再試行
}
```

#### 3. Content Script実行エラー
```javascript
// 特定のページで実行できない場合
const RESTRICTED_URLS = [
  'chrome://',
  'chrome-extension://',
  'https://chrome.google.com/webstore'
]

if (RESTRICTED_URLS.some(url => tab.url?.startsWith(url))) {
  throw new Error('このページでは実行できません')
}
```

## パフォーマンスのベストプラクティス

1. **チャンクサイズの最適化**: 4000-5000文字が最適
2. **バッチ処理**: 3-5チャンクを並列処理
3. **キャッシュ活用**: 同じURLは30分間結果を保存
4. **メモリ管理**: 大きなテキストは処理後即座に解放
5. **プログレッシブUI**: 結果を順次表示

---

*最終更新: 2025年8月11日*