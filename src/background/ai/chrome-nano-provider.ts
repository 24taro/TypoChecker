import { AISessionManager } from '../ai-session'
import { BaseAIProvider, type TokenInfo, type StreamOptions } from './ai-provider'

export class ChromeNanoProvider extends BaseAIProvider {
  private sessionManager: AISessionManager

  constructor() {
    super()
    this.sessionManager = new AISessionManager()
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await this.sessionManager.initialize()
      this.initialized = true
      console.log('Chrome Nano provider initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Chrome Nano provider:', error)
      
      if (error && typeof error === 'object' && 'code' in error) {
        const message = 'message' in error ? (error.message as string) : 'Chrome Nano initialization failed'
        throw this.createError(
          error.code as string,
          message || 'Chrome Nano initialization failed'
        )
      }
      
      throw this.createError(
        'INITIALIZATION_FAILED',
        `Chrome Nano initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const availability = await this.sessionManager.checkAvailability()
      return availability === 'readily'
    } catch (error) {
      console.error('Chrome Nano availability check failed:', error)
      return false
    }
  }

  async analyzeContent(
    prompt: string, 
    content: string, 
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    await this.ensureInitialized()

    try {
      console.log('Analyzing content with Chrome Nano...')
      console.log('Chrome Nano - Prompt length:', prompt?.length || 0)
      console.log('Chrome Nano - Content length:', content?.length || 0)
      console.log('Chrome Nano - Session manager available:', !!this.sessionManager)
      
      const result = await this.sessionManager.analyzeText(prompt, content, options)
      
      console.log('Chrome Nano analysis completed:', {
        responseLength: result?.length || 0,
        tokenInfo: this.sessionManager.getTokensInfo(),
      })
      
      return result
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Chrome Nano request aborted by user')
        throw error
      }

      console.error('Chrome Nano analysis failed:', error)
      console.error('Chrome Nano error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: typeof error,
        hasCode: error && typeof error === 'object' && 'code' in error
      })

      if (error && typeof error === 'object' && 'code' in error) {
        const message = 'message' in error ? (error.message as string) : 'Chrome Nano analysis failed'
        throw this.createError(
          error.code as string,
          message || 'Chrome Nano analysis failed'
        )
      }

      throw this.createError(
        'ANALYSIS_FAILED',
        `Chrome Nano analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async analyzeContentStream(
    prompt: string,
    content: string,
    chatHistory?: any[],
    options?: StreamOptions
  ): Promise<void> {
    await this.ensureInitialized()

    try {
      // 会話履歴を考慮したプロンプトを構築
      const conversationPrompt = this.buildConversationPrompt(prompt, content, chatHistory)
      
      // Chrome NanoはストリーミングAPIがないため、通常の分析結果を分割して送信
      const result = await this.analyzeContent(conversationPrompt, '', { signal: options?.signal })
      
      // 文字を少しずつ送信してストリーミング風にする
      const words = result.split('')
      let accumulatedText = ''
      
      for (let i = 0; i < words.length; i++) {
        accumulatedText += words[i]
        
        if (options?.onChunk) {
          options.onChunk({ text: words[i] })
        }
        
        // 自然なタイピング速度をシミュレート（1-10ms間隔）
        if (i < words.length - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 1))
        }
        
        // アボートシグナルをチェック
        if (options?.signal?.aborted) {
          throw new Error('Request was aborted')
        }
      }
      
      if (options?.onComplete) {
        options.onComplete(result, this.getTokenInfo() || undefined)
      }
    } catch (error) {
      if (options?.onError) {
        if (error && typeof error === 'object' && 'code' in error) {
          const message = 'message' in error ? (error.message as string) : 'Chrome Nano streaming failed'
          options.onError(this.createError(
            error.code as string,
            message
          ))
        } else {
          options.onError(this.createError(
            'STREAM_FAILED',
            `Chrome Nano streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          ))
        }
      }
      throw error
    }
  }

  getTokenInfo(): TokenInfo | null {
    try {
      return this.sessionManager.getTokensInfo()
    } catch (error) {
      console.error('Failed to get token info:', error)
      return null
    }
  }

  destroy(): void {
    try {
      this.sessionManager.destroy()
      this.initialized = false
      console.log('Chrome Nano provider destroyed')
    } catch (error) {
      console.error('Error destroying Chrome Nano provider:', error)
    }
  }

  getProviderName(): string {
    return 'Chrome Built-in AI (Gemini Nano)'
  }

  getProviderDescription(): string {
    return 'Using Chrome\'s built-in Gemini Nano model (local processing)'
  }

  // Chrome固有の機能へのアクセス
  async initiateModelDownload(): Promise<void> {
    try {
      await this.sessionManager.initiateModelDownload()
    } catch (error) {
      console.error('Model download initiation failed:', error)
      throw this.createError(
        'MODEL_DOWNLOAD_FAILED',
        `Failed to initiate model download: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async getDetailedAvailability(): Promise<string> {
    try {
      return await this.sessionManager.checkAvailability()
    } catch (error) {
      console.error('Detailed availability check failed:', error)
      return 'no'
    }
  }

  private buildConversationPrompt(prompt: string, content: string, chatHistory?: any[]): string {
    // 会話履歴がある場合は、それを含めた総合的なプロンプトを構築
    if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
      let conversationContext = '以下は過去の会話履歴です:\n\n'
      
      for (const message of chatHistory) {
        if (message && typeof message === 'object' && message.role && message.content && typeof message.content === 'string') {
          if (message.role === 'user') {
            conversationContext += `ユーザー: ${message.content}\n\n`
          } else if (message.role === 'assistant') {
            conversationContext += `アシスタント: ${message.content}\n\n`
          }
        } else {
          console.warn('Invalid message in chat history for Chrome Nano:', message)
        }
      }
      
      conversationContext += `上記の会話履歴を踏まえて、最新のユーザーメッセージに対して適切に応答してください。`
      
      return conversationContext
    } else {
      if (chatHistory !== undefined && !Array.isArray(chatHistory)) {
        console.warn('Invalid chatHistory type for Chrome Nano (not an array):', typeof chatHistory, chatHistory)
      }
      
      // 初回の場合は、従来通りページコンテンツと一緒に送信
      return `ユーザーリクエスト:
${prompt}

対象コンテンツ:
${content}

上記のコンテンツに対してユーザーリクエストを実行してください。`
    }
  }
}