import type { AISettings, AIProvider as AIProviderType } from '../../shared/types/settings'
import { DEFAULT_AI_SETTINGS } from '../../shared/types/settings'
import type { AIProvider, TokenInfo, AIProviderError, StreamOptions } from './ai-provider'
import type { ChatMessage } from '../../shared/types/messages'
import { GeminiProvider } from './gemini-provider'
import { ChromeNanoProvider } from './chrome-nano-provider'

interface AIAnalysisResult {
  result: string
  provider: string
  tokenInfo?: TokenInfo
}

export class AIManager {
  private currentProvider: AIProvider | null = null
  private fallbackProvider: ChromeNanoProvider | null = null
  private settings: AISettings = { ...DEFAULT_AI_SETTINGS }
  private isInitialized = false

  constructor() {
    this.setupStorageListener()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    console.log('Initializing AI Manager...')
    
    // 設定を読み込む
    await this.loadSettings()
    
    // プロバイダーを作成
    await this.createProvider()
    
    this.isInitialized = true
    console.log('AI Manager initialized successfully')
  }

  async analyzeContent(
    prompt: string, 
    content: string, 
    options?: { signal?: AbortSignal }
  ): Promise<AIAnalysisResult> {
    await this.ensureInitialized()

    if (!this.currentProvider) {
      throw new Error('No AI provider available')
    }

    try {
      console.log(`Analyzing content with ${this.currentProvider.getProviderName()}...`)
      console.log('Prompt length:', prompt?.length || 0)
      console.log('Content length:', content?.length || 0)
      console.log('Provider type:', this.currentProvider.constructor.name)
      
      const result = await this.currentProvider.analyzeContent(prompt, content, options)
      
      return {
        result,
        provider: this.currentProvider.getProviderName(),
        tokenInfo: this.currentProvider.getTokenInfo() || undefined,
      }
    } catch (error) {
      console.error('Primary provider failed:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: typeof error,
        shouldFallback: this.shouldFallback(error),
        fallbackAvailable: !!this.fallbackProvider,
        fallbackEnabled: this.settings.fallbackToChromeNano
      })
      
      // フォールバック処理
      if (this.shouldFallback(error) && this.fallbackProvider && this.settings.fallbackToChromeNano) {
        console.log('Attempting fallback to Chrome Nano...')
        console.log('Fallback provider type:', this.fallbackProvider.constructor.name)
        
        try {
          const fallbackResult = await this.fallbackProvider.analyzeContent(prompt, content, options)
          
          console.log('Fallback succeeded:', {
            resultLength: fallbackResult.length,
            provider: this.fallbackProvider.getProviderName()
          })
          
          return {
            result: fallbackResult,
            provider: `${this.fallbackProvider.getProviderName()} (fallback)`,
            tokenInfo: this.fallbackProvider.getTokenInfo() || undefined,
          }
        } catch (fallbackError) {
          console.error('Fallback provider also failed:', fallbackError)
          console.error('Fallback error details:', {
            message: fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error',
            type: typeof fallbackError
          })
          throw this.createCombinedError(error, fallbackError)
        }
      } else {
        console.log('Skipping fallback:', {
          shouldFallback: this.shouldFallback(error),
          fallbackAvailable: !!this.fallbackProvider,
          fallbackEnabled: this.settings.fallbackToChromeNano
        })
      }
      
      throw error
    }
  }

  async analyzeContentStream(
    prompt: string,
    content: string,
    chatHistory: ChatMessage[] = [],
    options?: StreamOptions
  ): Promise<void> {
    await this.ensureInitialized()

    if (!this.currentProvider) {
      throw new Error('No AI provider available')
    }

    console.log(`Starting streaming analysis with ${this.currentProvider.getProviderName()}...`)
    console.log('Prompt length:', prompt?.length || 0)
    console.log('Content length:', content?.length || 0)

    try {
      await this.currentProvider.analyzeContentStream(prompt, content, chatHistory, options)
    } catch (error) {
      console.error('Primary provider streaming failed:', error)
      
      // フォールバック処理
      if (this.shouldFallback(error) && this.fallbackProvider && this.settings.fallbackToChromeNano) {
        console.log('Attempting fallback to Chrome Nano for streaming...')
        
        try {
          // フォールバック時のオプションを作成（プロバイダー名を調整）
          const fallbackOptions: StreamOptions = {
            ...options,
            onComplete: options?.onComplete ? (fullText, tokenInfo) => {
              // フォールバックプロバイダーのトークン情報を使用
              const fallbackTokenInfo = this.fallbackProvider?.getTokenInfo() || tokenInfo
              options.onComplete?.(fullText, fallbackTokenInfo)
            } : undefined
          }
          
          await this.fallbackProvider.analyzeContentStream(prompt, content, chatHistory, fallbackOptions)
          
          console.log(`Fallback provider completed: ${this.fallbackProvider.getProviderName()}`)
        } catch (fallbackError) {
          console.error('Fallback provider streaming also failed:', fallbackError)
          throw this.createCombinedError(error, fallbackError)
        }
      } else {
        throw error
      }
    }
  }

  async checkAvailability(): Promise<{
    primary: boolean
    fallback?: boolean
    primaryProvider: string
    fallbackProvider?: string
  }> {
    await this.ensureInitialized()

    const result = {
      primary: false,
      primaryProvider: this.currentProvider?.getProviderName() || 'None',
      fallback: undefined as boolean | undefined,
      fallbackProvider: undefined as string | undefined,
    }

    if (this.currentProvider) {
      try {
        result.primary = await this.currentProvider.checkAvailability()
      } catch (error) {
        console.error('Primary provider availability check failed:', error)
      }
    }

    if (this.fallbackProvider && this.settings.fallbackToChromeNano) {
      try {
        result.fallback = await this.fallbackProvider.checkAvailability()
        result.fallbackProvider = this.fallbackProvider.getProviderName()
      } catch (error) {
        console.error('Fallback provider availability check failed:', error)
      }
    }

    return result
  }

  getCurrentProvider(): AIProvider | null {
    return this.currentProvider
  }

  getSettings(): AISettings {
    return { ...this.settings }
  }

  async updateSettings(newSettings: Partial<AISettings>): Promise<void> {
    const updatedSettings = { ...this.settings, ...newSettings }
    
    try {
      await chrome.storage.sync.set({ aiSettings: updatedSettings })
      console.log('Settings updated:', updatedSettings)
    } catch (error) {
      console.error('Failed to update settings:', error)
      throw error
    }
  }

  destroy(): void {
    console.log('Destroying AI Manager...')
    
    this.currentProvider?.destroy()
    this.fallbackProvider?.destroy()
    
    this.currentProvider = null
    this.fallbackProvider = null
    this.isInitialized = false
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['aiSettings'])
      this.settings = {
        ...DEFAULT_AI_SETTINGS,
        ...result.aiSettings,
      }
      console.log('Settings loaded:', this.settings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      this.settings = { ...DEFAULT_AI_SETTINGS }
    }
  }

  private async createProvider(): Promise<void> {
    console.log('Creating providers with settings:', this.settings)
    
    // 既存のプロバイダーを破棄
    this.currentProvider?.destroy()
    this.fallbackProvider?.destroy()

    // プライマリープロバイダーを作成
    if (this.settings.provider === 'gemini-api') {
      // API キーの検証を強化
      if (this.settings.geminiApiKey && this.settings.geminiApiKey.trim().length > 0) {
        console.log('Creating Gemini API provider with valid API key')
        try {
          this.currentProvider = new GeminiProvider(
            this.settings.geminiApiKey.trim(),
            this.settings.geminiModel
          )
        } catch (error) {
          console.error('Failed to create Gemini provider:', error)
          console.log('Falling back to Chrome Nano as primary')
          this.currentProvider = new ChromeNanoProvider()
        }
      } else {
        console.warn('Gemini API key not provided or empty, using Chrome Nano as primary')
        this.currentProvider = new ChromeNanoProvider()
      }
    } else {
      console.log('Creating Chrome Nano provider as primary')
      this.currentProvider = new ChromeNanoProvider()
    }

    // フォールバック用のChrome Nanoプロバイダーを作成
    if (this.settings.fallbackToChromeNano && this.settings.provider === 'gemini-api' && this.currentProvider instanceof GeminiProvider) {
      console.log('Creating Chrome Nano fallback provider')
      this.fallbackProvider = new ChromeNanoProvider()
      try {
        // フォールバックプロバイダーは事前に初期化しておく
        console.log('Initializing fallback provider...')
        await this.fallbackProvider.initialize()
        console.log('Fallback provider initialized successfully')
      } catch (error) {
        console.warn('Fallback provider initialization failed:', error)
        this.fallbackProvider = null
      }
    } else {
      console.log('Fallback provider not needed:', {
        fallbackEnabled: this.settings.fallbackToChromeNano,
        primaryProvider: this.settings.provider,
        currentProviderType: this.currentProvider?.constructor.name
      })
    }

    // プライマリープロバイダーを初期化
    if (this.currentProvider) {
      try {
        console.log('Initializing primary provider...')
        await this.currentProvider.initialize()
        console.log('Primary provider initialized:', this.currentProvider.getProviderName())
      } catch (error) {
        console.error('Primary provider initialization failed:', error)
        console.error('Primary initialization error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: typeof error
        })
        
        // 初期化に失敗した場合、フォールバックがあればそれを使用
        if (this.fallbackProvider) {
          console.log('Using fallback provider as primary')
          this.currentProvider?.destroy()
          this.currentProvider = this.fallbackProvider
          this.fallbackProvider = null
        } else {
          // フォールバックもない場合は、Chrome Nanoを作成
          console.log('Creating Chrome Nano as emergency fallback')
          this.currentProvider?.destroy()
          this.currentProvider = new ChromeNanoProvider()
          try {
            await this.currentProvider.initialize()
            console.log('Emergency fallback provider initialized')
          } catch (fallbackError) {
            console.error('Emergency fallback also failed:', fallbackError)
            throw fallbackError
          }
        }
      }
    } else {
      console.error('No primary provider created, creating Chrome Nano as fallback')
      this.currentProvider = new ChromeNanoProvider()
      await this.currentProvider.initialize()
    }
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener(async (changes) => {
      if (changes.aiSettings) {
        console.log('Settings changed, reloading AI Manager...')
        await this.loadSettings()
        await this.createProvider()
      }
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }
  }

  private shouldFallback(error: unknown): boolean {
    // フォールバックすべきエラーの判定
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as AIProviderError).code
      
      // ネットワークエラーやAPI制限エラーの場合はフォールバック
      return [
        'REQUEST_FAILED',
        'GEMINI_API_ERROR_429', // Rate limit
        'GEMINI_API_ERROR_503', // Service unavailable
        'GEMINI_API_ERROR_500', // Server error
      ].includes(code)
    }
    
    // 一般的なネットワークエラーもフォールバック対象
    if (error instanceof Error) {
      return error.message.includes('fetch') || 
             error.message.includes('network') ||
             error.message.includes('timeout')
    }
    
    return false
  }

  private createCombinedError(primaryError: unknown, fallbackError: unknown): Error {
    const primaryMsg = primaryError instanceof Error ? primaryError.message : 'Primary provider failed'
    const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : 'Fallback provider failed'
    
    return new Error(`Both AI providers failed. Primary: ${primaryMsg}. Fallback: ${fallbackMsg}`)
  }
}