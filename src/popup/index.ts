import type { TypoError, AnalysisResult } from '../shared/types/messages'
import { StorageManager } from '../shared/storage'

class PopupUI {
  private analyzeBtn: HTMLButtonElement
  private progressContainer: HTMLElement
  private progressBar: HTMLElement
  private progressText: HTMLElement
  private summarySection: HTMLElement
  private errorsSection: HTMLElement
  private errorList: HTMLElement
  private settingsSection: HTMLElement
  
  constructor() {
    this.analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement
    this.progressContainer = document.getElementById('progress-container') as HTMLElement
    this.progressBar = document.getElementById('progress-bar') as HTMLElement
    this.progressText = document.getElementById('progress-text') as HTMLElement
    this.summarySection = document.getElementById('summary-section') as HTMLElement
    this.errorsSection = document.getElementById('errors-section') as HTMLElement
    this.errorList = document.getElementById('error-list') as HTMLElement
    this.settingsSection = document.getElementById('settings-section') as HTMLElement
    
    this.setupEventListeners()
    this.setupMessageListeners()
    this.checkAIAvailability()
    this.loadApiKey()
  }
  
  private setupEventListeners(): void {
    this.analyzeBtn.addEventListener('click', () => this.startAnalysis())
    
    document.querySelectorAll('.filter-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const filter = (e.target as HTMLElement).dataset.filter
        this.filterErrors(filter)
      })
    })
    
    document.getElementById('export-btn')?.addEventListener('click', () => {
      this.exportResults()
    })
    
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.toggleSettings()
    })
    
    document.getElementById('save-api-key-btn')?.addEventListener('click', () => {
      this.saveApiKey()
    })
    
    document.getElementById('clear-api-key-btn')?.addEventListener('click', () => {
      this.clearApiKey()
    })
    
    document.getElementById('ai-provider-select')?.addEventListener('change', (e) => {
      const provider = (e.target as HTMLSelectElement).value as 'chrome-ai' | 'gemini-api'
      this.setAIProvider(provider)
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
          
        case 'ANALYSIS_ERROR':
          this.handleAnalysisError(message.error)
          break
          
        case 'MODEL_DOWNLOAD_PROGRESS':
          this.showDownloadProgress(message.progress)
          break
      }
    })
  }
  
  private async startAnalysis(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    
    if (!tab.id) {
      this.showError('タブの取得に失敗しました')
      return
    }
    
    this.analyzeBtn.disabled = true
    this.progressContainer.classList.remove('hidden')
    this.errorList.innerHTML = ''
    
    chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      tabId: tab.id,
    })
  }
  
  private updateProgress(current: number, total: number): void {
    const percentage = (current / total) * 100
    this.progressBar.style.width = `${percentage}%`
    this.progressText.textContent = `${current}/${total} チャンク処理中...`
  }
  
  private displayResults(data: { errors?: TypoError[]; url?: string; tokenInfo?: unknown }): void {
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    
    if (!data || !data.errors) {
      this.showMessage('エラーは見つかりませんでした')
      return
    }
    
    this.summarySection.classList.remove('hidden')
    
    const typoCount = data.errors.filter((e: TypoError) => e.type === 'typo').length
    const grammarCount = data.errors.filter((e: TypoError) => e.type === 'grammar').length
    const japaneseCount = data.errors.filter((e: TypoError) => e.type === 'japanese').length
    
    const typoElement = document.getElementById('typo-count')
    const grammarElement = document.getElementById('grammar-count')
    const japaneseElement = document.getElementById('japanese-count')
    
    if (typoElement) typoElement.textContent = typoCount.toString()
    if (grammarElement) grammarElement.textContent = grammarCount.toString()
    if (japaneseElement) japaneseElement.textContent = japaneseCount.toString()
    
    this.errorsSection.classList.remove('hidden')
    this.renderErrors(data.errors)
  }
  
  private renderErrors(errors: TypoError[]): void {
    this.errorList.innerHTML = errors
      .map(
        (error, index) => `
      <div class="error-item ${error.severity}" data-type="${error.type}" data-index="${index}">
        <div class="error-header">
          <span class="error-type">${this.getTypeLabel(error.type)}</span>
          <span class="error-severity">${this.getSeverityLabel(error.severity)}</span>
        </div>
        <div class="error-text">${this.escapeHtml(error.text || error.original || '')}</div>
        <div class="error-suggestion">
          修正案: ${this.escapeHtml(error.suggestion || '')}
        </div>
        <div class="error-actions">
          <button class="copy-btn" data-text="${this.escapeHtml(error.suggestion || '')}">
            コピー
          </button>
        </div>
      </div>
    `
      )
      .join('')
    
    this.errorList.querySelectorAll('.copy-btn').forEach((btn) => {
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
    
    items.forEach((item) => {
      const itemType = (item as HTMLElement).dataset.type
      if (filter === 'all' || filter === itemType) {
        ;(item as HTMLElement).style.display = 'block'
      } else {
        ;(item as HTMLElement).style.display = 'none'
      }
    })
    
    document.querySelectorAll('.filter-tabs .tab').forEach((tab) => {
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
      japanese: '日本語',
    }
    return labels[type] || type
  }
  
  private getSeverityLabel(severity: string): string {
    const labels: Record<string, string> = {
      error: 'エラー',
      warning: '警告',
      info: '情報',
    }
    return labels[severity] || severity
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
  
  private showError(message: string): void {
    console.error(message)
    
    // 長いメッセージの場合は詳細エラー表示
    if (message.length > 100) {
      this.showDetailedError(message)
    } else {
      this.showToast(message, 'error')
    }
  }
  
  private showDetailedError(message: string): void {
    // 既存のエラー表示を削除
    const existingError = document.querySelector('.detailed-error')
    if (existingError) {
      existingError.remove()
    }
    
    // 詳細エラー表示を作成
    const errorDiv = document.createElement('div')
    errorDiv.className = 'detailed-error'
    errorDiv.innerHTML = `
      <div class="detailed-error-content">
        <h3>エラー</h3>
        <div class="error-message">${this.escapeHtml(message).replace(/\n/g, '<br>')}</div>
        <button class="close-error-btn">閉じる</button>
      </div>
    `
    
    document.body.appendChild(errorDiv)
    
    // 閉じるボタンのイベント
    errorDiv.querySelector('.close-error-btn')?.addEventListener('click', () => {
      errorDiv.remove()
    })
    
    // エラー領域外クリックで閉じる
    errorDiv.addEventListener('click', (e) => {
      if (e.target === errorDiv) {
        errorDiv.remove()
      }
    })
  }
  
  private showMessage(message: string): void {
    const messageDiv = document.createElement('div')
    messageDiv.className = 'message-info'
    messageDiv.textContent = message
    this.errorList.innerHTML = ''
    this.errorList.appendChild(messageDiv)
  }
  
  private showToast(message: string, type = 'success'): void {
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.textContent = message
    document.body.appendChild(toast)
    
    setTimeout(() => {
      toast.remove()
    }, 3000)
  }
  
  private showDownloadProgress(progress: number): void {
    this.progressText.textContent = `AIモデルダウンロード中: ${Math.round(progress)}%`
    this.progressBar.style.width = `${progress}%`
  }
  
  private exportResults(): void {
    console.log('Export results')
  }

  private async checkAIAvailability(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AI_AVAILABILITY' })
      
      if (response.error) {
        this.showError(`AI利用不可: ${response.error}`)
        this.analyzeBtn.disabled = true
        return
      }

      const provider = await StorageManager.getAIProvider()
      
      switch (response.availability) {
        case 'no':
          if (provider === 'gemini-api') {
            this.showError('Gemini API Keyが設定されていません。設定ボタンからAPI Keyを入力してください。')
          } else {
            this.showError(`Chrome AI APIは利用できません。
            
必要な設定：
1. Chrome 138以降を使用
2. chrome://flags/#built-in-ai-api を Enabled に設定
3. chrome://flags/#gemini-nano-api を Enabled に設定（必要に応じて）
4. Chromeを再起動

代替案：設定からGemini 2.5 Flash APIに切り替え`)
          }
          this.analyzeBtn.disabled = true
          break
        
        case 'after-download':
          this.showMessage('AIモデルのダウンロードが必要です。初回実行時にダウンロードされます。')
          break
        
        case 'readily':
          if (provider === 'gemini-api') {
            console.log('AI API is ready (Gemini 2.5 Flash)')
            this.showMessage('Gemini 2.5 Flash準備完了')
          } else {
            console.log('Chrome AI API is ready (Gemini Nano)')
            this.showMessage('Chrome内蔵AI準備完了')
          }
          break
      }
    } catch (error) {
      console.error('Failed to check AI availability:', error)
      this.showError('AI APIの確認に失敗しました')
    }
  }

  private toggleSettings(): void {
    // 他のセクションを非表示
    this.summarySection.classList.add('hidden')
    this.errorsSection.classList.add('hidden')
    
    // 設定セクションの表示/非表示を切り替え
    this.settingsSection.classList.toggle('hidden')
  }
  
  private async loadApiKey(): Promise<void> {
    // プロバイダーの設定を読み込む
    const provider = await StorageManager.getAIProvider()
    const select = document.getElementById('ai-provider-select') as HTMLSelectElement
    if (select) {
      select.value = provider
    }
    
    // Gemini API設定の表示/非表示
    const geminiSettings = document.querySelectorAll('.gemini-api-settings')
    geminiSettings.forEach(el => {
      if (provider === 'gemini-api') {
        el.classList.remove('hidden')
      } else {
        el.classList.add('hidden')
      }
    })
    
    // API Keyの読み込み
    const apiKey = await StorageManager.getApiKey()
    if (apiKey) {
      const input = document.getElementById('api-key-input') as HTMLInputElement
      if (input) {
        // API Keyの一部だけを表示
        input.value = apiKey.substring(0, 10) + '...'
      }
    }
  }
  
  private async setAIProvider(provider: 'chrome-ai' | 'gemini-api'): Promise<void> {
    await StorageManager.setAIProvider(provider)
    
    // Gemini API設定の表示/非表示
    const geminiSettings = document.querySelectorAll('.gemini-api-settings')
    geminiSettings.forEach(el => {
      if (provider === 'gemini-api') {
        el.classList.remove('hidden')
      } else {
        el.classList.add('hidden')
      }
    })
    
    await this.checkAIAvailability()
    
    if (provider === 'chrome-ai') {
      this.showMessage('Chrome内蔵AI (Gemini Nano)を使用します')
    } else {
      this.showMessage('Gemini 2.5 Flash APIを使用します')
    }
  }
  
  private async saveApiKey(): Promise<void> {
    const input = document.getElementById('api-key-input') as HTMLInputElement
    const apiKey = input.value.trim()
    
    if (!apiKey) {
      this.showError('API Keyを入力してください')
      return
    }
    
    // ...が含まれている場合は既存のAPIキーなので保存しない
    if (apiKey.includes('...')) {
      this.showMessage('API Keyは既に保存されています')
      return
    }
    
    try {
      await StorageManager.setApiKey(apiKey)
      this.showMessage('API Keyを保存しました')
      await this.loadApiKey()
      await this.checkAIAvailability()
    } catch (error) {
      this.showError('API Keyの保存に失敗しました')
    }
  }
  
  private async clearApiKey(): Promise<void> {
    try {
      await StorageManager.clearApiKey()
      const input = document.getElementById('api-key-input') as HTMLInputElement
      if (input) {
        input.value = ''
      }
      this.showMessage('API Keyを削除しました')
      await this.checkAIAvailability()
    } catch (error) {
      this.showError('API Keyの削除に失敗しました')
    }
  }
  
  private handleAnalysisError(error: { code?: string; message?: string } | Error): void {
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    
    let message = 'エラーが発生しました'
    const errorCode = error instanceof Error ? undefined : error.code
    
    switch (errorCode) {
      case 'NOT_AVAILABLE':
        message = 'Chrome AI APIが利用できません。設定を確認してください。'
        break
      case 'DOWNLOAD_REQUIRED':
        message = 'AIモデルのダウンロードが必要です。'
        break
      case 'SESSION_FAILED':
        message = 'AIセッションの作成に失敗しました。'
        break
      case 'PROMPT_FAILED':
        message = 'テキスト分析に失敗しました。'
        break
      default:
        message = error.message || message
    }
    
    this.showError(message)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupUI()
})