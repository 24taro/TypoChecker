import type { TypoError, AnalysisResult } from '../shared/types/messages'

class PopupUI {
  private analyzeBtn: HTMLButtonElement
  private progressContainer: HTMLElement
  private progressBar: HTMLElement
  private progressText: HTMLElement
  private summarySection: HTMLElement
  private errorsSection: HTMLElement
  private errorList: HTMLElement
  
  constructor() {
    this.analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement
    this.progressContainer = document.getElementById('progress-container') as HTMLElement
    this.progressBar = document.getElementById('progress-bar') as HTMLElement
    this.progressText = document.getElementById('progress-text') as HTMLElement
    this.summarySection = document.getElementById('summary-section') as HTMLElement
    this.errorsSection = document.getElementById('errors-section') as HTMLElement
    this.errorList = document.getElementById('error-list') as HTMLElement
    
    this.setupEventListeners()
    this.setupMessageListeners()
    this.checkAIAvailability()
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
      chrome.runtime.openOptionsPage()
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
          
        case 'MODEL_DOWNLOAD_START':
          this.handleModelDownloadStart(message.data.message)
          break
          
        case 'MODEL_DOWNLOAD_PROGRESS':
          this.handleModelDownloadProgress(message.data)
          break

        case 'MODEL_DOWNLOAD_COMPLETE':
          this.handleModelDownloadComplete(message.data)
          break

        case 'MODEL_DOWNLOAD_ERROR':
          this.handleModelDownloadError(message.data)
          break

        case 'ANALYSIS_STREAM_START':
          this.handleStreamingStart(message.data.message)
          break

        case 'ANALYSIS_STREAM_CHUNK':
          this.handleStreamingChunk(message.data)
          break

        case 'ANALYSIS_STREAM_END':
          this.handleStreamingEnd(message.data)
          break

        case 'ANALYSIS_STREAM_ERROR':
          this.handleStreamingError(message.data)
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
    this.summarySection.classList.add('hidden')
    this.errorsSection.classList.add('hidden')
    
    // ストリーミングモードかどうかをチェック（後で実装）
    const useStreaming = true // デフォルトでストリーミング有効
    
    if (useStreaming) {
      chrome.runtime.sendMessage({
        type: 'START_STREAMING_ANALYSIS',
        tabId: tab.id,
      })
    } else {
      chrome.runtime.sendMessage({
        type: 'START_ANALYSIS',
        tabId: tab.id,
      })
    }
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
    this.showToast(message, 'error')
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
  
  private async initiateModelDownload(): Promise<void> {
    try {
      this.analyzeBtn.disabled = true
      this.progressContainer.classList.remove('hidden')
      this.progressText.textContent = 'AIモデルのダウンロードを準備中...'
      this.progressBar.style.width = '10%'
      
      await chrome.runtime.sendMessage({ type: 'INITIATE_MODEL_DOWNLOAD' })
    } catch (error) {
      console.error('Failed to initiate model download:', error)
      this.showError('モデルダウンロードの開始に失敗しました')
    }
  }

  private handleModelDownloadStart(message: string): void {
    console.log('Model download started:', message)
    this.progressContainer.classList.remove('hidden')
    this.progressText.textContent = message
    this.progressBar.style.width = '20%'
    this.analyzeBtn.disabled = true
  }

  private handleModelDownloadProgress(data: { message: string; progress?: number }): void {
    console.log('Model download progress:', data)
    this.progressText.textContent = data.message
    if (data.progress) {
      this.progressBar.style.width = `${Math.round(data.progress)}%`
    }
  }

  private handleModelDownloadComplete(data: { message: string; success: boolean }): void {
    console.log('Model download completed:', data)
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    
    if (data.success) {
      this.showToast(data.message, 'success')
      // AI可用性を再チェック
      this.checkAIAvailability()
    } else {
      this.showError(data.message)
    }
  }

  private handleModelDownloadError(data: { message: string; error: string }): void {
    console.error('Model download error:', data)
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    this.showError(`${data.message}: ${data.error}`)
  }

  private handleStreamingStart(message: string): void {
    console.log('Streaming analysis started:', message)
    this.progressContainer.classList.remove('hidden')
    this.progressText.textContent = message
    this.progressBar.style.width = '5%'
    this.analyzeBtn.disabled = true
    
    // エラーリストをクリアして準備
    this.errorList.innerHTML = ''
    this.summarySection.classList.add('hidden')
    this.errorsSection.classList.remove('hidden')
  }

  private handleStreamingChunk(data: { chunk: string; progress?: number }): void {
    // プログレスバー更新
    if (data.progress) {
      this.progressBar.style.width = `${data.progress}%`
      this.progressText.textContent = `AI分析中... ${data.progress}%`
    }
  }

  private handleStreamingEnd(data: { finalResults: any; stats: any }): void {
    console.log('Streaming analysis completed:', data)
    
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    
    // 最終結果の統計を表示
    this.summarySection.classList.remove('hidden')
    this.updateStatistics(data.stats)
    
    this.showToast(`分析完了: ${data.stats.totalErrors}個のエラーを検出`, 'success')
  }

  private handleStreamingError(data: { message: string; error: string }): void {
    console.error('Streaming analysis error:', data)
    
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    this.showError(`${data.message}: ${data.error}`)
  }


  private createErrorElement(error: any, index: number): HTMLElement {
    const errorDiv = document.createElement('div')
    errorDiv.className = `error-item ${error.severity || 'warning'}`
    errorDiv.dataset.type = error.type
    errorDiv.dataset.index = index.toString()
    
    errorDiv.innerHTML = `
      <div class="error-header">
        <span class="error-type">${this.getTypeLabel(error.type)}</span>
        <span class="error-severity">${this.getSeverityLabel(error.severity || 'warning')}</span>
      </div>
      <div class="error-text">${this.escapeHtml(error.original || error.text || '')}</div>
      <div class="error-suggestion">
        修正案: ${this.escapeHtml(error.suggestion || '')}
      </div>
      <div class="error-actions">
        <button class="copy-btn" data-text="${this.escapeHtml(error.suggestion || '')}">
          コピー
        </button>
      </div>
    `
    
    // コピーボタンのイベントリスナー
    const copyBtn = errorDiv.querySelector('.copy-btn')
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        const text = (e.target as HTMLElement).dataset.text
        if (text) {
          navigator.clipboard.writeText(text)
          this.showToast('コピーしました')
        }
      })
    }
    
    return errorDiv
  }

  private updateStatistics(stats: any): void {
    const typoElement = document.getElementById('typo-count')
    const grammarElement = document.getElementById('grammar-count')
    const japaneseElement = document.getElementById('japanese-count')
    
    if (typoElement) typoElement.textContent = stats.typoCount.toString()
    if (grammarElement) grammarElement.textContent = stats.grammarCount.toString()
    if (japaneseElement) japaneseElement.textContent = stats.japaneseCount.toString()
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

      switch (response.availability) {
        case 'no':
          this.showError('Chrome AI APIは利用できません。Chrome 138以降でフラグを有効にしてください。')
          this.analyzeBtn.disabled = true
          break
        
        case 'after-download':
          this.showMessage('AIモデルのダウンロード中です。しばらくお待ちください。')
          break

        case 'downloadable':
          this.showMessage('AIモデルをダウンロードします。')
          this.initiateModelDownload()
          break
        
        case 'readily':
          console.log('Chrome AI API is ready')
          break
      }
    } catch (error) {
      console.error('Failed to check AI availability:', error)
      this.showError('AI APIの確認に失敗しました')
    }
  }

  private handleAnalysisError(error: { code?: string; message?: string } | Error): void {
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    
    let message = 'エラーが発生しました'
    
    // エラーオブジェクトにcodeプロパティがあるかチェック
    const errorCode = 'code' in error ? error.code : undefined
    
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