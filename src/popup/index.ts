import type { TypoError, AnalysisResult, ChatMessage } from '../shared/types/messages'

class PopupUI {
  private sendBtn: HTMLButtonElement
  private clearBtn: HTMLButtonElement
  private promptInput: HTMLTextAreaElement
  private progressContainer: HTMLElement
  private progressBar: HTMLElement
  private progressText: HTMLElement
  private chatMessagesContainer: HTMLElement
  private emptyState: HTMLElement
  private providerNameSpan: HTMLElement
  private statusIndicator: HTMLElement
  private settingsBtn: HTMLButtonElement
  
  private currentTabId: number | null = null
  private chatHistory: ChatMessage[] = []
  private isProcessing = false
  private streamingMessageId: string | null = null
  private streamingContent = ''
  
  constructor() {
    this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement
    this.clearBtn = document.getElementById('clear-chat') as HTMLButtonElement
    this.promptInput = document.getElementById('user-prompt') as HTMLTextAreaElement
    this.progressContainer = document.getElementById('progress-container') as HTMLElement
    this.progressBar = document.getElementById('progress-bar') as HTMLElement
    this.progressText = document.getElementById('progress-text') as HTMLElement
    this.chatMessagesContainer = document.getElementById('chat-messages') as HTMLElement
    this.emptyState = document.getElementById('empty-state') as HTMLElement
    this.providerNameSpan = document.getElementById('provider-name') as HTMLElement
    this.statusIndicator = document.getElementById('status') as HTMLElement
    this.settingsBtn = document.getElementById('settings-link-btn') as HTMLButtonElement
    
    this.setupEventListeners()
    this.setupMessageListeners()
    this.initializeChat()
  }
  
  private setupEventListeners(): void {
    this.sendBtn.addEventListener('click', () => this.sendMessage())
    
    this.clearBtn.addEventListener('click', () => this.clearChat())
    
    // プロンプト入力監視
    this.promptInput.addEventListener('input', () => {
      this.updateSendButtonState()
      this.adjustTextareaHeight()
    })
    
    // Enterキーで送信（Shift+Enterで改行）
    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!this.sendBtn.disabled) {
          this.sendMessage()
        }
      }
    })
    
    this.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage()
    })
    
    document.getElementById('export-btn')?.addEventListener('click', () => {
      this.exportResults()
    })
    
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage()
    })
  }
  
  private updateSendButtonState(): void {
    const hasPrompt = this.promptInput.value.trim().length > 0
    this.sendBtn.disabled = !hasPrompt || this.isProcessing
  }
  
  private adjustTextareaHeight(): void {
    this.promptInput.style.height = 'auto'
    this.promptInput.style.height = `${Math.min(this.promptInput.scrollHeight, 120)}px`
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

        case 'ANALYSIS_STREAM_START':
          this.handleStreamStart(message.data.message)
          break

        case 'ANALYSIS_STREAM_CHUNK':
          this.handleStreamChunk(message.data.chunk)
          break

        case 'ANALYSIS_STREAM_END':
          this.handleStreamEnd(message.data)
          break

        case 'ANALYSIS_STREAM_ERROR':
          this.handleStreamError(message.data)
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
  
  private async initializeChat(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    
    if (!tab.id) {
      this.showError('タブの取得に失敗しました')
      return
    }
    
    this.currentTabId = tab.id
    
    // AI可用性をチェック
    await this.checkAIAvailability()
    
    // チャット履歴を読み込み
    await this.loadChatHistory()
  }
  
  private async sendMessage(): Promise<void> {
    if (!this.currentTabId) {
      this.showError('タブ情報の取得に失敗しました')
      return
    }
    
    const userPrompt = this.promptInput.value.trim()
    if (!userPrompt) {
      return
    }
    
    this.isProcessing = true
    this.updateSendButtonState()
    
    // ユーザーメッセージを追加
    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: 'user',
      content: userPrompt,
      timestamp: Date.now(),
      tabId: this.currentTabId || undefined
    }
    
    this.addMessageToChat(userMessage)
    await this.saveChatMessage(userMessage)
    
    // 入力をクリア
    this.promptInput.value = ''
    this.adjustTextareaHeight()
    
    // プログレス表示
    this.progressContainer.classList.remove('hidden')
    
    // 分析を実行
    chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      tabId: this.currentTabId,
      userPrompt,
    })
  }
  
  private async clearChat(): Promise<void> {
    if (!this.currentTabId) return
    
    if (confirm('チャット履歴をクリアしますか？')) {
      this.chatHistory = []
      await this.clearChatStorage()
      this.renderChatMessages()
    }
  }
  
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  private updateProgress(current: number, total: number): void {
    const percentage = (current / total) * 100
    this.progressBar.style.width = `${percentage}%`
    this.progressText.textContent = `${current}/${total} 処理中...`
  }

  private async handleAnalysisComplete(data: { 
    fullText: string; 
    provider?: string; 
    tokenInfo?: { used: number; quota: number; remaining: number } 
  }): Promise<void> {
    this.progressContainer.classList.add('hidden')
    this.isProcessing = false
    this.updateSendButtonState()
    
    let resultText = ''
    
    if (!data.fullText.trim()) {
      resultText = '処理結果がありませんでした。'
    } else {
      resultText = data.fullText
    }
    
    // プロバイダー情報を結果に追加
    if (data.provider) {
      resultText += `\n\n--- 処理情報 ---\n使用AI: ${data.provider}`
      
      if (data.tokenInfo) {
        resultText += `\nトークン使用量: ${data.tokenInfo.used}/${data.tokenInfo.quota} (残り: ${data.tokenInfo.remaining})`
      }
    }
    
    // アシスタントメッセージを追加
    const assistantMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: 'assistant',
      content: resultText,
      timestamp: Date.now(),
      tabId: this.currentTabId || undefined
    }
    
    this.addMessageToChat(assistantMessage)
    await this.saveChatMessage(assistantMessage)
    
    this.showToast('処理完了', 'success')
  }
  
  private showError(message: string): void {
    console.error(message)
    this.showToast(message, 'error')
    this.isProcessing = false
    this.updateSendButtonState()
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
      this.isProcessing = true
      this.updateSendButtonState()
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
    this.isProcessing = true
    this.updateSendButtonState()
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
    this.isProcessing = false
    this.updateSendButtonState()
    
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
    this.isProcessing = false
    this.updateSendButtonState()
    this.showError(`${data.message}: ${data.error}`)
  }

  private handleAnalysisStart(message: string): void {
    console.log('Analysis started:', message)
    this.progressContainer.classList.remove('hidden')
    this.progressText.textContent = message
    this.progressBar.style.width = '50%'
    this.isProcessing = true
    this.updateSendButtonState()
  }





  private showDownloadProgress(progress: number): void {
    this.progressText.textContent = `AIモデルダウンロード中: ${Math.round(progress)}%`
    this.progressBar.style.width = `${progress}%`
  }
  
  private exportResults(): void {
    if (!this.chatHistory.length) {
      this.showError('エクスポートするチャット履歴がありません')
      return
    }
    
    const chatText = this.chatHistory.map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleString('ja-JP')
      const role = msg.role === 'user' ? 'ユーザー' : 'AI'
      return `[${timestamp}] ${role}:\n${msg.content}\n`
    }).join('\n')
    
    const blob = new Blob([chatText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    this.showToast('チャット履歴をエクスポートしました')
  }

  private async checkAIAvailability(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AI_AVAILABILITY' })
      
      if (response.error) {
        this.updateProviderStatus('エラー', 'error')
        this.showError(`AI利用不可: ${response.error}`)
        this.sendBtn.disabled = true
        return
      }

      const details = response.details
      if (details) {
        // プライマリープロバイダーの状態を表示
        if (details.primary) {
          this.updateProviderStatus(details.primaryProvider, 'success')
        } else {
          // フォールバックプロバイダーがある場合
          if (details.fallback) {
            this.updateProviderStatus(`${details.fallbackProvider} (fallback)`, 'warning')
          } else {
            this.updateProviderStatus('利用不可', 'error')
          }
        }
      }

      switch (response.availability) {
        case 'no':
          this.showError('AI APIは利用できません。設定を確認してください。')
          break
        
        case 'after-download':
          this.showToast('AIモデルのダウンロード中です。しばらくお待ちください。', 'warning')
          break

        case 'downloadable':
          this.showToast('AIモデルをダウンロードします。')
          this.initiateModelDownload()
          break
        
        case 'readily':
          console.log('AI API is ready')
          break
      }
    } catch (error) {
      console.error('Failed to check AI availability:', error)
      this.updateProviderStatus('接続エラー', 'error')
      this.showError('AI APIの確認に失敗しました')
    }
  }

  private updateProviderStatus(providerName: string, status: 'success' | 'warning' | 'error'): void {
    this.providerNameSpan.textContent = providerName
    
    // ステータスインジケーターのクラスを更新
    this.statusIndicator.className = `status-indicator ${status}`
  }

  private handleAnalysisError(error: { code?: string; message?: string } | Error): void {
    this.progressContainer.classList.add('hidden')
    this.isProcessing = false
    this.updateSendButtonState()
    
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

  // === チャット履歴管理メソッド ===

  private addMessageToChat(message: ChatMessage): void {
    this.chatHistory.push(message)
    this.renderChatMessages()
  }

  private renderChatMessages(): void {
    this.chatMessagesContainer.innerHTML = ''
    
    if (this.chatHistory.length === 0) {
      this.chatMessagesContainer.appendChild(this.emptyState)
      return
    }

    this.chatHistory.forEach(message => {
      const messageElement = this.createMessageElement(message)
      this.chatMessagesContainer.appendChild(messageElement)
    })

    // 最新のメッセージまでスクロール
    this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const messageDiv = document.createElement('div')
    messageDiv.className = `chat-message ${message.role}`

    const contentDiv = document.createElement('div')
    contentDiv.className = `message-content ${message.role}`
    contentDiv.textContent = message.content

    const timestampDiv = document.createElement('div')
    timestampDiv.className = 'message-timestamp'
    timestampDiv.textContent = new Date(message.timestamp).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    messageDiv.appendChild(contentDiv)
    messageDiv.appendChild(timestampDiv)

    return messageDiv
  }

  // === Chrome Storage API メソッド ===

  private async saveChatMessage(message: ChatMessage): Promise<void> {
    if (!this.currentTabId) return

    try {
      const key = `chat_${this.currentTabId}`
      const result = await chrome.storage.local.get([key])
      const messages: ChatMessage[] = result[key] || []
      
      messages.push(message)
      
      // 最大履歴数を制限（100件まで）
      const limitedMessages = messages.slice(-100)
      
      await chrome.storage.local.set({ [key]: limitedMessages })
    } catch (error) {
      console.error('Failed to save chat message:', error)
    }
  }

  private async loadChatHistory(): Promise<void> {
    if (!this.currentTabId) return

    try {
      const key = `chat_${this.currentTabId}`
      const result = await chrome.storage.local.get([key])
      this.chatHistory = result[key] || []
      this.renderChatMessages()
    } catch (error) {
      console.error('Failed to load chat history:', error)
      this.chatHistory = []
      this.renderChatMessages()
    }
  }

  private async clearChatStorage(): Promise<void> {
    if (!this.currentTabId) return

    try {
      const key = `chat_${this.currentTabId}`
      await chrome.storage.local.remove([key])
    } catch (error) {
      console.error('Failed to clear chat storage:', error)
    }
  }

  // === ストリーミング処理メソッド ===

  private handleStreamStart(message: string): void {
    console.log('Stream started:', message)
    this.progressContainer.classList.remove('hidden')
    this.progressText.textContent = message
    this.progressBar.style.width = '50%'
    this.isProcessing = true
    this.updateSendButtonState()

    // ストリーミング用の一時メッセージを作成
    this.streamingMessageId = this.generateMessageId()
    this.streamingContent = ''

    const tempMessage: ChatMessage = {
      id: this.streamingMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      tabId: this.currentTabId || undefined
    }

    this.addStreamingMessageToChat(tempMessage)
  }

  private handleStreamChunk(chunk: string): void {
    if (!this.streamingMessageId) return

    this.streamingContent += chunk
    this.updateStreamingMessage(this.streamingContent)
  }

  private async handleStreamEnd(data: {
    fullText: string
    provider?: string
    tokenInfo?: { used: number; quota: number; remaining: number }
  }): Promise<void> {
    this.progressContainer.classList.add('hidden')
    this.isProcessing = false
    this.updateSendButtonState()

    if (!this.streamingMessageId) return

    let resultText = data.fullText || this.streamingContent

    // プロバイダー情報を結果に追加
    if (data.provider) {
      resultText += `\n\n--- 処理情報 ---\n使用AI: ${data.provider}`

      if (data.tokenInfo) {
        resultText += `\nトークン使用量: ${data.tokenInfo.used}/${data.tokenInfo.quota} (残り: ${data.tokenInfo.remaining})`
      }
    }

    // 最終メッセージとしてチャット履歴に保存
    const finalMessage: ChatMessage = {
      id: this.streamingMessageId,
      role: 'assistant',
      content: resultText,
      timestamp: Date.now(),
      tabId: this.currentTabId || undefined
    }

    this.finalizeStreamingMessage(finalMessage)
    await this.saveChatMessage(finalMessage)

    // ストリーミング状態をリセット
    this.streamingMessageId = null
    this.streamingContent = ''

    this.showToast('処理完了', 'success')
  }

  private handleStreamError(data: { message: string; error: string }): void {
    console.error('Stream error:', data)
    this.progressContainer.classList.add('hidden')
    this.isProcessing = false
    this.updateSendButtonState()

    // ストリーミングメッセージを削除
    if (this.streamingMessageId) {
      this.removeStreamingMessage(this.streamingMessageId)
      this.streamingMessageId = null
      this.streamingContent = ''
    }

    this.showError(`${data.message}: ${data.error}`)
  }

  private addStreamingMessageToChat(message: ChatMessage): void {
    const messageElement = this.createStreamingMessageElement(message)
    this.chatMessagesContainer.appendChild(messageElement)
    
    // Empty stateを非表示
    this.emptyState.style.display = 'none'

    // 最新のメッセージまでスクロール
    this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight
  }

  private createStreamingMessageElement(message: ChatMessage): HTMLElement {
    const messageDiv = document.createElement('div')
    messageDiv.className = `chat-message ${message.role}`
    messageDiv.setAttribute('data-message-id', message.id)

    const contentDiv = document.createElement('div')
    contentDiv.className = `message-content ${message.role}`
    contentDiv.innerHTML = message.content

    // タイピングカーソルを追加
    const cursorSpan = document.createElement('span')
    cursorSpan.className = 'typing-cursor'
    cursorSpan.textContent = '|'
    contentDiv.appendChild(cursorSpan)

    const timestampDiv = document.createElement('div')
    timestampDiv.className = 'message-timestamp'
    timestampDiv.textContent = new Date(message.timestamp).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    messageDiv.appendChild(contentDiv)
    messageDiv.appendChild(timestampDiv)

    return messageDiv
  }

  private updateStreamingMessage(content: string): void {
    if (!this.streamingMessageId) return

    const messageElement = this.chatMessagesContainer.querySelector(`[data-message-id="${this.streamingMessageId}"]`)
    if (messageElement) {
      const contentDiv = messageElement.querySelector('.message-content')
      if (contentDiv) {
        // カーソルを保持してコンテンツを更新
        const cursorSpan = contentDiv.querySelector('.typing-cursor')
        contentDiv.innerHTML = content
        if (cursorSpan) {
          contentDiv.appendChild(cursorSpan)
        }

        // 最新のメッセージまでスクロール
        this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight
      }
    }
  }

  private finalizeStreamingMessage(message: ChatMessage): void {
    const messageElement = this.chatMessagesContainer.querySelector(`[data-message-id="${message.id}"]`)
    if (messageElement) {
      const contentDiv = messageElement.querySelector('.message-content')
      if (contentDiv) {
        // カーソルを削除して最終コンテンツを設定
        contentDiv.innerHTML = message.content

        // チャット履歴を更新
        const index = this.chatHistory.findIndex(m => m.id === message.id)
        if (index >= 0) {
          this.chatHistory[index] = message
        } else {
          this.chatHistory.push(message)
        }
      }
    }
  }

  private removeStreamingMessage(messageId: string): void {
    const messageElement = this.chatMessagesContainer.querySelector(`[data-message-id="${messageId}"]`)
    if (messageElement) {
      messageElement.remove()
    }

    // チャット履歴からも削除
    this.chatHistory = this.chatHistory.filter(m => m.id !== messageId)

    // メッセージがない場合はempty stateを表示
    if (this.chatHistory.length === 0) {
      this.emptyState.style.display = 'block'
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupUI()
})