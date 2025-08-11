/// <reference path="../shared/types/chrome-ai.d.ts" />
import type { AIAvailability, AIError, AIAnalysisResult } from '../shared/types/chrome-ai'
import { PROMPTS } from '../shared/constants'

export class AISessionManager {
  private session: LanguageModelSession | null = null
  private isInitializing = false

  async checkAvailability(): Promise<AIAvailability> {
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

    try {
      const prompt = PROMPTS.USER_TEMPLATE(text)
      const response = await this.session.prompt(prompt)
      return response
    } catch (error) {
      console.error('Failed to analyze text:', error)
      throw this.createError('PROMPT_FAILED', 'テキスト分析に失敗しました。')
    }
  }

  parseAnalysisResult(response: string): Partial<AIAnalysisResult> {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('No JSON found in response:', response)
        return { errors: [] }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        errors: parsed.errors || [],
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error)
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