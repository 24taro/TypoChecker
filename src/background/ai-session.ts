/// <reference path="../shared/types/chrome-ai.d.ts" />
import type { AIAvailability, AIError, AIAnalysisResult } from '../shared/types/chrome-ai'
import { PROMPTS } from '../shared/constants'
import { GeminiClient } from './gemini-client'
import { StorageManager } from '../shared/storage'

export class AISessionManager {
  private session: LanguageModelSession | null = null
  private isInitializing = false
  private geminiClient: GeminiClient | null = null
  private useGeminiApi = false

  async checkAvailability(): Promise<AIAvailability> {
    try {
      const provider = await StorageManager.getAIProvider()
      console.log('Checking availability for provider:', provider)
      
      if (provider === 'gemini-api') {
        // Gemini APIを使用
        const apiKey = await StorageManager.getApiKey()
        console.log('Gemini API selected, has API Key:', !!apiKey)
        if (apiKey) {
          console.log('Using Gemini 2.5 Flash API with API Key')
          this.useGeminiApi = true
          return 'readily'
        } else {
          console.log('Gemini API selected but no API Key')
          return 'no'
        }
      } else {
        // Chrome AI APIを使用
        console.log('Chrome AI selected, checking availability...')
        this.useGeminiApi = false
        
        console.log('LanguageModel type:', typeof LanguageModel)
        console.log('LanguageModel available:', typeof LanguageModel !== 'undefined')
        
        if (typeof LanguageModel === 'undefined') {
          console.log('Chrome AI API not available - LanguageModel is undefined')
          return 'no'
        }

        console.log('Checking LanguageModel.availability()...')
        try {
          const availability = await LanguageModel.availability()
          console.log('Chrome AI availability result:', availability)
          
          // 新しいAPIの戻り値をマッピング
          switch (availability) {
            case 'available':
              console.log('Chrome AI is available')
              return 'readily'
            case 'downloading':
              console.log('Chrome AI is downloading')
              return 'after-download'
            default:
              console.log('Chrome AI not available:', availability)
              return 'no'
          }
        } catch (availabilityError) {
          console.error('Error checking LanguageModel availability:', availabilityError)
          return 'no'
        }
      }
    } catch (error) {
      console.error('Failed to check AI availability:', error)
      return 'no'
    }
  }

  async initialize(): Promise<void> {
    if ((this.session || this.geminiClient) || this.isInitializing) {
      console.log('Session already exists or initializing')
      return
    }

    this.isInitializing = true

    try {
      const availability = await this.checkAvailability()
      
      if (availability === 'no') {
        const provider = await StorageManager.getAIProvider()
        if (provider === 'gemini-api') {
          throw this.createError('NOT_AVAILABLE', 'Gemini API Keyが設定されていません。')
        } else {
          throw this.createError('NOT_AVAILABLE', 'Chrome AI APIは利用できません。Chrome 138以降でフラグを有効にしてください。')
        }
      }

      if (availability === 'after-download') {
        throw this.createError('DOWNLOAD_REQUIRED', 'AIモデルのダウンロードが必要です。')
      }

      if (this.useGeminiApi) {
        // Gemini APIを使用
        console.log('Initializing Gemini API client...')
        this.geminiClient = new GeminiClient()
        await this.geminiClient.initialize()
        console.log('Gemini API client initialized successfully')
      } else {
        // Chrome AI APIを使用
        console.log('Initializing Chrome AI (Gemini Nano)...')
        
        if (typeof LanguageModel === 'undefined') {
          console.error('LanguageModel is undefined - Chrome AI API not available')
          throw this.createError('NOT_AVAILABLE', 'LanguageModel APIが見つかりません。Chrome 138以降でフラグを有効にしてください。')
        }

        console.log('LanguageModel is available, checking availability...')
        const availability = await LanguageModel.availability()
        console.log('Chrome AI availability check result:', availability)
        
        if (availability !== 'available') {
          console.error('Chrome AI not available:', availability)
          throw this.createError('NOT_AVAILABLE', `Chrome AIが利用できません: ${availability}`)
        }

        console.log('Creating Chrome AI session with config:', {
          systemPrompt: PROMPTS.SYSTEM.substring(0, 100) + '...',
          temperature: 0.2,
          topK: 3,
        })
        
        try {
          this.session = await LanguageModel.create({
            systemPrompt: PROMPTS.SYSTEM,
            temperature: 0.2,
            topK: 3,
          })
          console.log('Chrome AI session created successfully:', {
            sessionExists: !!this.session,
            sessionType: typeof this.session,
          })
        } catch (sessionError) {
          console.error('Failed to create Chrome AI session:', sessionError)
          throw this.createError('SESSION_FAILED', `Chrome AIセッションの作成に失敗: ${sessionError instanceof Error ? sessionError.message : 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Failed to initialize AI session:', error)
      throw error
    } finally {
      this.isInitializing = false
    }
  }

  async analyzeText(text: string): Promise<string> {
    console.log('analyzeText called with text length:', text.length)
    console.log('Current state:', {
      hasSession: !!this.session,
      hasGeminiClient: !!this.geminiClient,
      useGeminiApi: this.useGeminiApi,
      isInitializing: this.isInitializing
    })
    
    if (!this.session && !this.geminiClient) {
      console.log('No session or client available, initializing...')
      await this.initialize()
    }

    if (this.useGeminiApi) {
      // Gemini APIを使用
      console.log('Using Gemini API for analysis')
      if (!this.geminiClient) {
        console.error('Gemini API client not available after initialization')
        throw this.createError('SESSION_FAILED', 'Gemini APIクライアントの作成に失敗しました。')
      }
      
      try {
        return await this.geminiClient.analyzeText(text)
      } catch (error) {
        console.error('Failed to analyze text with Gemini API:', error)
        throw this.createError('PROMPT_FAILED', `テキスト分析に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } else {
      // Chrome AI APIを使用
      console.log('Using Chrome AI for analysis')
      if (!this.session) {
        console.error('Chrome AI session not available after initialization')
        throw this.createError('SESSION_FAILED', 'AIセッションの作成に失敗しました。')
      }

      try {
        const prompt = PROMPTS.USER_TEMPLATE(text)
        
        // 送信するプロンプトをログ出力
        console.log('=== AI PROMPT START ===')
        console.log('📤 Sending prompt to Chrome AI:')
        console.log(prompt)
        console.log('=== AI PROMPT END ===')
        
        const response = await this.session.prompt(prompt)
        
        // AIからのレスポンスをログ出力
        console.log('=== AI RESPONSE START ===')
        console.log('📥 Response from Chrome AI:')
        console.log(response)
        console.log('=== AI RESPONSE END ===')
        
        return response
      } catch (error) {
        console.error('Failed to analyze text with Chrome AI:', error)
        throw this.createError('PROMPT_FAILED', `テキスト分析に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  parseAnalysisResult(response: string): Partial<AIAnalysisResult> {
    try {
      // まず直接JSONパースを試みる
      const parsed = JSON.parse(response)
      console.log('Successfully parsed JSON directly')
      return {
        errors: parsed.errors || [],
      }
    } catch (firstError) {
      // 直接パースに失敗した場合、JSON部分を抽出する
      console.log('Direct JSON parse failed, trying to extract JSON from response')
      
      try {
        // レスポンスからJSON部分を抽出（最初の{から最後の}まで）
        const jsonMatch = response.match(/\{[\s\S]*\}/g)
        
        if (jsonMatch) {
          // 複数のJSON候補がある場合は、errorsプロパティを含むものを探す
          for (const candidate of jsonMatch) {
            try {
              const parsed = JSON.parse(candidate)
              if (parsed.errors !== undefined) {
                console.log('Successfully extracted and parsed JSON from response')
                return {
                  errors: parsed.errors || [],
                }
              }
            } catch {
              // このJSON候補は無効、次を試す
              continue
            }
          }
        }
        
        // コードブロック内のJSONを探す
        const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g
        let match
        while ((match = codeBlockRegex.exec(response)) !== null) {
          const jsonContent = match[1] // キャプチャグループから直接取得
          try {
            const parsed = JSON.parse(jsonContent)
            if (parsed.errors !== undefined) {
              console.log('Successfully extracted JSON from code block')
              return {
                errors: parsed.errors || [],
              }
            }
          } catch {
            continue
          }
        }
        
        console.error('No valid JSON found in response:', response)
        return { errors: [] }
      } catch (error) {
        console.error('Failed to extract JSON from response:', error)
        return { errors: [] }
      }
    }
  }

  async destroy(): Promise<void> {
    if (this.session) {
      try {
        this.session.destroy()
      } catch (error) {
        console.error('Failed to destroy session:', error)
      }
      this.session = null
    }
    
    if (this.geminiClient) {
      await this.geminiClient.destroy()
      this.geminiClient = null
    }
  }

  getTokensInfo(): { used: number; max: number; remaining: number } | null {
    if (this.useGeminiApi && this.geminiClient) {
      return this.geminiClient.getTokensInfo()
    }
    
    if (!this.session) return null

    return {
      used: this.session.tokensSoFar || 0,
      max: this.session.maxTokens || 0,
      remaining: this.session.tokensLeft || 0,
    }
  }

  private createError(code: AIError['code'], message: string): AIError {
    return { code, message }
  }
}