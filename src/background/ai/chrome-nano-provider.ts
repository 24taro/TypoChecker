import { AISessionManager } from '../ai-session'
import { BaseAIProvider, type TokenInfo } from './ai-provider'

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
      console.log('Chrome Nano - Prompt length:', prompt.length)
      console.log('Chrome Nano - Content length:', content.length)
      console.log('Chrome Nano - Session manager available:', !!this.sessionManager)
      
      const result = await this.sessionManager.analyzeText(prompt, content, options)
      
      console.log('Chrome Nano analysis completed:', {
        responseLength: result.length,
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
}