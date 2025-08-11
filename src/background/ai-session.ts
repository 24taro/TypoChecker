/// <reference path="../shared/types/chrome-ai.d.ts" />
import type { AIAvailability, AIError, AIAnalysisResult } from '../shared/types/chrome-ai'
import { PROMPTS, TEST_MODE, DUMMY_ERRORS } from '../shared/constants'

export class AISessionManager {
  private session: LanguageModelSession | null = null
  private isInitializing = false

  async checkAvailability(): Promise<AIAvailability> {
    // テストモードの場合は常に利用可能を返す
    if (TEST_MODE.ENABLED) {
      console.log('🧪 Test mode enabled - returning mock availability')
      return 'readily'
    }

    try {
      // Chrome 138+ では LanguageModel がグローバルで利用可能
      if (typeof LanguageModel === 'undefined') {
        console.log('LanguageModel API not available')
        return 'no'
      }

      const availability = await LanguageModel.availability()
      console.log('AI availability:', availability)
      
      // 新しいAPIの戻り値をマッピング
      switch (availability) {
        case 'available':
          return 'readily'
        case 'downloading':
          return 'after-download'
        default:
          return 'no'
      }
    } catch (error) {
      console.error('Failed to check AI availability:', error)
      return 'no'
    }
  }

  async initialize(): Promise<void> {
    if (this.session || this.isInitializing) {
      console.log('Session already exists or initializing')
      return
    }

    this.isInitializing = true

    try {
      // テストモードの場合はダミーセッションを作成
      if (TEST_MODE.ENABLED) {
        console.log('🧪 Test mode - creating mock session')
        // ダミーセッションとしてオブジェクトを設定
        this.session = {} as LanguageModelSession
        this.isInitializing = false
        return
      }

      const availability = await this.checkAvailability()
      
      if (availability === 'no') {
        throw this.createError('NOT_AVAILABLE', 'Chrome AI APIは利用できません。Chrome 138以降でフラグを有効にしてください。')
      }

      if (availability === 'after-download') {
        throw this.createError('DOWNLOAD_REQUIRED', 'AIモデルのダウンロードが必要です。')
      }

      if (typeof LanguageModel === 'undefined') {
        throw this.createError('NOT_AVAILABLE', 'LanguageModel APIが見つかりません。')
      }

      console.log('Creating AI session...')
      this.session = await LanguageModel.create({
        systemPrompt: PROMPTS.SYSTEM,
        temperature: 0.2,
        topK: 3,
      })

      console.log('AI session created successfully')
    } catch (error) {
      console.error('Failed to initialize AI session:', error)
      throw error
    } finally {
      this.isInitializing = false
    }
  }

  async analyzeText(text: string): Promise<string> {
    if (!this.session) {
      await this.initialize()
    }

    if (!this.session) {
      throw this.createError('SESSION_FAILED', 'AIセッションの作成に失敗しました。')
    }

    // テストモードの場合はダミーエラーを返す
    if (TEST_MODE.ENABLED) {
      console.log('🧪 Test mode - returning mock errors for text:', text.substring(0, 50) + '...')
      
      // 遅延を追加してリアルな処理をシミュレート
      await new Promise(resolve => setTimeout(resolve, TEST_MODE.DELAY_MS))
      
      // テストモードでは常にすべてのダミーエラーを表示（デバッグ用）
      // 本番では適切な数に調整することを推奨
      const selectedErrors = [...DUMMY_ERRORS]
      
      // JSON形式で返す
      return JSON.stringify({ errors: selectedErrors })
    }

    try {
      const prompt = PROMPTS.USER_TEMPLATE(text)
      
      // 送信するプロンプトをログ出力
      console.log('=== AI PROMPT START ===')
      console.log('📤 Sending prompt to Gemini Nano:')
      console.log(prompt)
      console.log('=== AI PROMPT END ===')
      
      const response = await this.session.prompt(prompt)
      
      // AIからのレスポンスをログ出力
      console.log('=== AI RESPONSE START ===')
      console.log('📥 Response from Gemini Nano:')
      console.log(response)
      console.log('=== AI RESPONSE END ===')
      
      return response
    } catch (error) {
      console.error('Failed to analyze text:', error)
      throw this.createError('PROMPT_FAILED', 'テキスト分析に失敗しました。')
    }
  }

  parseAnalysisResult(response: string): Partial<AIAnalysisResult> {
    console.log('=== PARSING ANALYSIS RESULT ===')
    console.log('📋 Raw response to parse:', response)
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('No JSON found in response:', response)
        return { errors: [] }
      }

      console.log('🔍 Found JSON:', jsonMatch[0])
      const parsed = JSON.parse(jsonMatch[0])
      console.log('✅ Parsed result:', parsed)
      
      return {
        errors: parsed.errors || [],
      }
    } catch (error) {
      console.error('❌ Failed to parse AI response:', error)
      return { errors: [] }
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
  }

  getTokensInfo(): { used: number; max: number; remaining: number } | null {
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