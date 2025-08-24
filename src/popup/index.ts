import type { TypoError, AnalysisResult, ChatMessage } from '../shared/types/messages'
import { marked } from 'marked'

class PopupUI {
  private sendBtn: HTMLButtonElement
  private clearBtn: HTMLButtonElement
  private promptInput: HTMLTextAreaElement
  private chatMessagesContainer: HTMLElement
  private initialMessage: HTMLElement
  private aiProviderInfo: HTMLElement
  private contentInfo: HTMLElement
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
    this.chatMessagesContainer = document.getElementById('chat-messages') as HTMLElement
    this.initialMessage = document.getElementById('initial-message') as HTMLElement
    this.aiProviderInfo = document.getElementById('ai-provider-info') as HTMLElement
    this.contentInfo = document.getElementById('content-info') as HTMLElement
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
    
  }
  
  private updateSendButtonState(): void {
    const hasPrompt = this.promptInput.value.trim().length > 0
    this.sendBtn.disabled = !hasPrompt || this.isProcessing
    
    if (this.isProcessing) {
      this.sendBtn.classList.add('loading')
      this.sendBtn.textContent = '処理中...'
    } else {
      this.sendBtn.classList.remove('loading')
      this.sendBtn.textContent = '送信'
    }
  }
  
  private adjustTextareaHeight(): void {
    this.promptInput.style.height = 'auto'
    this.promptInput.style.height = `${Math.min(this.promptInput.scrollHeight, 120)}px`
  }
  
  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message) => {
      console.log('Popup received message:', message.type, message.data)
      switch (message.type) {
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
          console.log('Stream started')
          this.handleStreamStart(message.data.message)
          break

        case 'ANALYSIS_STREAM_CHUNK':
          this.handleStreamChunk(message.data.chunk)
          break

        case 'ANALYSIS_STREAM_END':
          console.log('Stream ended with data:', message.data)
          this.handleStreamEnd(message.data)
          break

        case 'ANALYSIS_STREAM_ERROR':
          this.handleStreamError(message.data)
          break

        case 'ANALYSIS_COMPLETE':
          console.log('Analysis complete with data:', message.data)
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
    // 初回メッセージかどうかを判定（ユーザーメッセージを追加する前に判定）
    const isFirstMessage = !this.chatHistory.some(msg => msg.role === 'assistant')
    
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
    
    // 会話履歴を準備（初回の場合は空配列、継続の場合は現在の履歴）
    const relevantHistory = isFirstMessage ? [] : this.chatHistory.filter(msg => 
      msg.role === 'user' || msg.role === 'assistant'
    )
    
    console.log('===== CHAT CONTEXT DEBUG =====')
    console.log('Total chat history length:', this.chatHistory.length)
    console.log('Relevant history length:', relevantHistory.length)
    console.log('Is first message:', isFirstMessage)
    console.log('Chat history details:', this.chatHistory.map(msg => ({
      role: msg.role,
      contentPreview: msg.content.substring(0, 50) + '...'
    })))
    
    // 分析を実行
    chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      tabId: this.currentTabId,
      userPrompt,
      chatHistory: relevantHistory,
      isFirstMessage,
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
  

  private async handleAnalysisComplete(data: { 
    fullText: string; 
    provider?: string; 
    tokenInfo?: { used: number; quota: number; remaining: number } 
  }): Promise<void> {
    console.log('ANALYSIS_COMPLETE received:', { provider: data.provider, tokenInfo: data.tokenInfo })
    
    this.isProcessing = false
    this.updateSendButtonState()
    
    let resultText = ''
    
    if (!data.fullText.trim()) {
      resultText = '処理結果がありませんでした。'
    } else {
      resultText = data.fullText
    }
    
    // アシスタントメッセージを追加
    const assistantMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: 'assistant',
      content: resultText,
      timestamp: Date.now(),
      tabId: this.currentTabId || undefined,
      provider: data.provider,
      tokenInfo: data.tokenInfo
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
      
      await chrome.runtime.sendMessage({ type: 'INITIATE_MODEL_DOWNLOAD' })
    } catch (error) {
      console.error('Failed to initiate model download:', error)
      this.showError('モデルダウンロードの開始に失敗しました')
    }
  }

  private handleModelDownloadStart(message: string): void {
    console.log('Model download started:', message)
    this.isProcessing = true
    this.updateSendButtonState()
  }

  private handleModelDownloadProgress(data: { message: string; progress?: number }): void {
    console.log('Model download progress:', data)
    // プログレスバーは使用しない（ボタンのローディング状態で表現）
  }

  private handleModelDownloadComplete(data: { message: string; success: boolean }): void {
    console.log('Model download completed:', data)
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
    this.isProcessing = false
    this.updateSendButtonState()
    this.showError(`${data.message}: ${data.error}`)
  }

  private handleAnalysisStart(message: string): void {
    console.log('Analysis started:', message)
    this.isProcessing = true
    this.updateSendButtonState()
  }





  

  private async checkAIAvailability(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AI_AVAILABILITY' })
      
      if (response.error) {
        this.aiProviderInfo.textContent = 'エラー - AI利用不可'
        this.aiProviderInfo.style.color = '#dc3545'
        this.showError(`AI利用不可: ${response.error}`)
        this.sendBtn.disabled = true
        return
      }

      const details = response.details
      if (details) {
        // プライマリープロバイダーの状態を表示
        if (details.primary) {
          this.aiProviderInfo.textContent = details.primaryProvider
          this.aiProviderInfo.style.color = '#28a745' // 成功カラー
        } else {
          // フォールバックプロバイダーがある場合
          if (details.fallback) {
            this.aiProviderInfo.textContent = `${details.fallbackProvider} (フォールバック)`
            this.aiProviderInfo.style.color = '#ffc107' // 警告カラー
          } else {
            this.aiProviderInfo.textContent = '利用不可'
            this.aiProviderInfo.style.color = '#dc3545' // エラーカラー
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

      // 設定情報を取得して送信情報を更新
      await this.updateContentInfo()

    } catch (error) {
      console.error('Failed to check AI availability:', error)
      this.aiProviderInfo.textContent = '接続エラー'
      this.aiProviderInfo.style.color = '#dc3545'
      this.showError('AI APIの確認に失敗しました')
    }
  }

  private async updateContentInfo(): Promise<void> {
    try {
      console.log('Requesting settings from background...')
      
      // 設定を取得（タイムアウト付き）
      const settingsResponse = await Promise.race([
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]) as any
      
      console.log('Settings response received:', settingsResponse)
      
      if (settingsResponse?.error) {
        console.error('Settings error:', settingsResponse.error)
        // エラーの場合はデフォルト設定を使用
        this.displayDefaultContentInfo()
        return
      }
      
      if (settingsResponse && settingsResponse.settings) {
        const contentLevel = settingsResponse.settings.contentLevel || 'html-css'
        console.log('Content level:', contentLevel)
        const contentItems = this.getContentLevelDescription(contentLevel)
        
        // コンテンツ情報を更新
        this.contentInfo.innerHTML = contentItems.map(item => `<li>${item}</li>`).join('')
      } else {
        console.error('Invalid settings response:', settingsResponse)
        // 無効なレスポンスの場合もデフォルト設定を使用
        this.displayDefaultContentInfo()
      }
    } catch (error) {
      console.error('Failed to get content info:', error)
      // エラーの場合はデフォルト設定を使用
      this.displayDefaultContentInfo()
    }
  }

  private displayDefaultContentInfo(): void {
    console.log('Using default content info')
    const defaultItems = this.getContentLevelDescription('html-css')
    this.contentInfo.innerHTML = defaultItems.map(item => `<li>${item}</li>`).join('')
  }

  private getContentLevelDescription(contentLevel: string): string[] {
    switch (contentLevel) {
      case 'text-only':
        return [
          '表示中のタブのテキスト内容',
          'ページタイトル'
        ]
      
      case 'html-only':
        return [
          '表示中のタブのHTML構造',
          'テキスト内容',
          'ページタイトル'
        ]
      
      case 'html-css':
        return [
          '表示中のタブのHTML構造',
          'CSSスタイル情報',
          'テキスト内容'
        ]
      
      case 'html-css-js':
        return [
          '表示中のタブのHTML構造',
          'CSSスタイル情報',
          'JavaScriptコード',
          'テキスト内容'
        ]
      
      default:
        return [
          '表示中のタブのHTML構造',
          'CSSスタイル情報',
          'テキスト内容'
        ]
    }
  }


  private handleAnalysisError(error: { code?: string; message?: string } | Error): void {
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
    console.log('renderChatMessages called with', this.chatHistory.length, 'messages')
    this.chatMessagesContainer.innerHTML = ''
    
    if (this.chatHistory.length === 0) {
      this.chatMessagesContainer.appendChild(this.initialMessage)
      return
    }

    this.chatHistory.forEach((message, index) => {
      console.log(`Rendering message ${index}:`, {
        id: message.id,
        role: message.role,
        provider: message.provider,
        tokenInfo: message.tokenInfo,
        hasProvider: !!message.provider,
        hasTokenInfo: !!message.tokenInfo
      })
      const messageElement = this.createMessageElement(message)
      this.chatMessagesContainer.appendChild(messageElement)
    })

    // 最新のメッセージまでスクロール
    this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight
  }

  // === マークダウンレンダリング機能 ===

  private renderMarkdown(text: string): string {
    try {
      return marked.parse(text) as string
    } catch (error) {
      console.error('Markdown rendering error:', error)
      return text
    }
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const messageDiv = document.createElement('div')
    messageDiv.className = `chat-message ${message.role}`

    const contentDiv = document.createElement('div')
    contentDiv.className = `message-content ${message.role}`
    
    // AIからのメッセージはマークダウンとしてレンダリング
    if (message.role === 'assistant') {
      contentDiv.innerHTML = this.renderMarkdown(message.content)
    } else {
      contentDiv.textContent = message.content
    }

    const timestampDiv = document.createElement('div')
    timestampDiv.className = 'message-timestamp'
    
    let timestampText = new Date(message.timestamp).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    
    // AIメッセージの場合、プロバイダーとトークン情報を追加
    if (message.role === 'assistant') {
      console.log('Processing assistant message:', { 
        id: message.id, 
        provider: message.provider, 
        tokenInfo: message.tokenInfo,
        hasProvider: !!message.provider,
        hasTokenInfo: !!message.tokenInfo
      })
      
      if (message.provider) {
        const shortProviderName = this.getShortProviderName(message.provider)
        timestampText += ` | 使用AI: ${shortProviderName}`
      }
      if (message.tokenInfo) {
        timestampText += ` | トークン使用量: ${message.tokenInfo.used}/${message.tokenInfo.quota} (残り: ${message.tokenInfo.remaining})`
      }
      
      if (!message.provider && !message.tokenInfo) {
        console.warn('Assistant message missing provider/token info:', message)
      }
    }
    
    timestampDiv.textContent = timestampText

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
      
      console.log('Saving message:', {
        id: message.id,
        role: message.role,
        provider: message.provider,
        tokenInfo: message.tokenInfo,
        hasProvider: !!message.provider,
        hasTokenInfo: !!message.tokenInfo
      })
      
      messages.push(message)
      
      // 最大履歴数を制限（100件まで）
      const limitedMessages = messages.slice(-100)
      
      await chrome.storage.local.set({ [key]: limitedMessages })
      console.log('Message saved successfully')
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
      console.log('Loaded chat history:', this.chatHistory.map(msg => ({ id: msg.id, role: msg.role, hasProvider: !!msg.provider, hasTokenInfo: !!msg.tokenInfo })))
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
    console.log('ANALYSIS_STREAM_END received:')
    console.log('- provider:', data.provider)
    console.log('- tokenInfo:', data.tokenInfo)
    console.log('- hasProvider:', !!data.provider)
    console.log('- hasTokenInfo:', !!data.tokenInfo)
    
    this.isProcessing = false
    this.updateSendButtonState()

    if (!this.streamingMessageId) return

    let resultText = data.fullText || this.streamingContent

    // 最終メッセージとしてチャット履歴に保存
    const finalMessage: ChatMessage = {
      id: this.streamingMessageId,
      role: 'assistant',
      content: resultText,
      timestamp: Date.now(),
      tabId: this.currentTabId || undefined,
      provider: data.provider,
      tokenInfo: data.tokenInfo
    }
    
    console.log('Created finalMessage:', {
      id: finalMessage.id,
      provider: finalMessage.provider,
      tokenInfo: finalMessage.tokenInfo,
      hasProvider: !!finalMessage.provider,
      hasTokenInfo: !!finalMessage.tokenInfo
    })

    this.finalizeStreamingMessage(finalMessage)
    await this.saveChatMessage(finalMessage)

    // ストリーミング状態をリセット
    this.streamingMessageId = null
    this.streamingContent = ''

    this.showToast('処理完了', 'success')
  }

  private handleStreamError(data: { message: string; error: string }): void {
    console.error('Stream error:', data)
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
    
    // Initial messageを非表示
    this.initialMessage.style.display = 'none'

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
    console.log('Finalizing streaming message:', {
      id: message.id,
      provider: message.provider,
      tokenInfo: message.tokenInfo,
      hasProvider: !!message.provider,
      hasTokenInfo: !!message.tokenInfo
    })
    
    const messageElement = this.chatMessagesContainer.querySelector(`[data-message-id="${message.id}"]`)
    if (messageElement) {
      const contentDiv = messageElement.querySelector('.message-content')
      const timestampDiv = messageElement.querySelector('.message-timestamp')
      
      if (contentDiv) {
        // カーソルを削除して最終コンテンツをマークダウンとしてレンダリング
        if (message.role === 'assistant') {
          contentDiv.innerHTML = this.renderMarkdown(message.content)
        } else {
          contentDiv.innerHTML = message.content
        }
      }
      
      // タイムスタンプも更新（provider/tokenInfo情報を追加）
      if (timestampDiv) {
        let timestampText = new Date(message.timestamp).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
        
        // AIメッセージの場合、プロバイダーとトークン情報を追加
        if (message.role === 'assistant') {
          if (message.provider) {
            const shortProviderName = this.getShortProviderName(message.provider)
            timestampText += ` | 使用AI: ${shortProviderName}`
          }
          if (message.tokenInfo) {
            timestampText += ` | トークン使用量: ${message.tokenInfo.used}/${message.tokenInfo.quota} (残り: ${message.tokenInfo.remaining})`
          }
        }
        
        timestampDiv.textContent = timestampText
        console.log('Updated timestamp:', timestampText)
      }

      // チャット履歴を更新
      const index = this.chatHistory.findIndex(m => m.id === message.id)
      if (index >= 0) {
        this.chatHistory[index] = message
      } else {
        this.chatHistory.push(message)
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

    // メッセージがない場合は初期メッセージを表示
    if (this.chatHistory.length === 0) {
      this.initialMessage.style.display = 'block'
    }
  }

  // === ユーティリティメソッド ===
  
  private getShortProviderName(provider: string): string {
    // プロバイダー名からモデル名を抽出
    if (provider.includes('Google Gemini API')) {
      // "Google Gemini API (gemini-2.5-flash)" → "gemini-2.5-flash"
      const match = provider.match(/\(([^)]+)\)/)
      if (match) {
        return match[1]
      }
      return 'GeminiAPI'
    }
    
    if (provider.includes('Chrome Built-in AI')) {
      // "Chrome Built-in AI (Gemini Nano)" → "Gemini Nano" 
      const match = provider.match(/\(([^)]+)\)/)
      if (match) {
        return match[1]
      }
      return 'Chrome AI'
    }
    
    return provider
  }

}

document.addEventListener('DOMContentLoaded', () => {
  new PopupUI()
})