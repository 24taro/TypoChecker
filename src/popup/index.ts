import type { TypoError, AnalysisResult } from '../shared/types/messages'

class PopupUI {
  private analyzeBtn: HTMLButtonElement
  private progressContainer: HTMLElement
  private progressBar: HTMLElement
  private progressText: HTMLElement
  private resultSection: HTMLElement
  private resultTextArea: HTMLTextAreaElement
  
  constructor() {
    this.analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement
    this.progressContainer = document.getElementById('progress-container') as HTMLElement
    this.progressBar = document.getElementById('progress-bar') as HTMLElement
    this.progressText = document.getElementById('progress-text') as HTMLElement
    this.resultSection = document.getElementById('result-section') as HTMLElement
    this.resultTextArea = document.getElementById('result-text') as HTMLTextAreaElement
    
    this.setupEventListeners()
    this.setupMessageListeners()
    this.checkAIAvailability()
  }
  
  private setupEventListeners(): void {
    this.analyzeBtn.addEventListener('click', () => this.startAnalysis())
    
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

        case 'ANALYSIS_START':
          this.handleAnalysisStart(message.data.message)
          break

        case 'ANALYSIS_COMPLETE':
          this.handleAnalysisComplete(message.data)
          break

        case 'ANALYSIS_ERROR':
          this.handleAnalysisError(new Error(message.data.message || 'Unknown error'))
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
    
    // 通常分析を実行
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

  private handleAnalysisComplete(data: { fullText: string }): void {
    this.progressContainer.classList.add('hidden')
    this.analyzeBtn.disabled = false
    this.resultSection.classList.remove('hidden')
    
    if (!data.fullText.trim()) {
      this.resultTextArea.value = '問題は見つかりませんでした。'
    } else {
      this.resultTextArea.value = data.fullText
    }
    
    this.showToast('分析完了', 'success')
  }
  
  private showError(message: string): void {
    console.error(message)
    this.showToast(message, 'error')
  }
  
  private showMessage(message: string): void {
    this.resultSection.classList.remove('hidden')
    this.resultTextArea.value = message
    this.showToast(message)
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

  private handleAnalysisStart(message: string): void {
    console.log('Analysis started:', message)
    this.progressContainer.classList.remove('hidden')
    this.progressText.textContent = message
    this.progressBar.style.width = '50%'
    this.analyzeBtn.disabled = true
    
    // テキストエリアをクリアして表示
    this.resultTextArea.value = ''
    this.resultSection.classList.remove('hidden')
  }





  private showDownloadProgress(progress: number): void {
    this.progressText.textContent = `AIモデルダウンロード中: ${Math.round(progress)}%`
    this.progressBar.style.width = `${progress}%`
  }
  
  private exportResults(): void {
    const text = this.resultTextArea.value
    if (!text.trim()) {
      this.showError('エクスポートする結果がありません')
      return
    }
    
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `typochecker-result-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    this.showToast('結果をエクスポートしました')
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