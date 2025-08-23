export interface TokenInfo {
  used: number
  quota: number
  remaining: number
}

export interface AIProviderError {
  code: string
  message: string
  details?: string
}

export interface StreamChunk {
  text: string
  isComplete?: boolean
}

export interface StreamOptions {
  onChunk?: (chunk: StreamChunk) => void
  onComplete?: (fullText: string, tokenInfo?: TokenInfo) => void
  onError?: (error: AIProviderError) => void
  signal?: AbortSignal
}

export interface AIProvider {
  /**
   * プロバイダーを初期化
   */
  initialize(): Promise<void>

  /**
   * AI可用性をチェック
   */
  checkAvailability(): Promise<boolean>

  /**
   * コンテンツを分析
   * @param prompt ユーザーのプロンプト
   * @param content 分析対象のコンテンツ
   * @param options オプション設定
   */
  analyzeContent(
    prompt: string, 
    content: string, 
    options?: { signal?: AbortSignal }
  ): Promise<string>

  /**
   * コンテンツをストリーミングで分析
   * @param prompt ユーザーのプロンプト
   * @param content 分析対象のコンテンツ
   * @param options ストリーミングオプション
   */
  analyzeContentStream(
    prompt: string, 
    content: string, 
    chatHistory?: any[],
    options?: StreamOptions
  ): Promise<void>

  /**
   * トークン情報を取得（利用可能な場合）
   */
  getTokenInfo(): TokenInfo | null

  /**
   * プロバイダーのリソースを解放
   */
  destroy(): void

  /**
   * プロバイダー名を取得
   */
  getProviderName(): string

  /**
   * プロバイダーの説明を取得
   */
  getProviderDescription(): string
}

export abstract class BaseAIProvider implements AIProvider {
  protected initialized = false

  abstract initialize(): Promise<void>
  abstract checkAvailability(): Promise<boolean>
  abstract analyzeContent(
    prompt: string, 
    content: string, 
    options?: { signal?: AbortSignal }
  ): Promise<string>
  abstract analyzeContentStream(
    prompt: string, 
    content: string, 
    chatHistory?: any[],
    options?: StreamOptions
  ): Promise<void>
  abstract getTokenInfo(): TokenInfo | null
  abstract destroy(): void
  abstract getProviderName(): string
  abstract getProviderDescription(): string

  protected createError(code: string, message: string, details?: string): AIProviderError {
    return { code, message, details }
  }

  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }
}