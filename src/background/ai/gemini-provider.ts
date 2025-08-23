import type { GeminiModel } from '../../shared/types/settings'
import { BaseAIProvider, type TokenInfo, type AIProviderError } from './ai-provider'

interface GeminiAPIResponse {
  candidates: Array<{
    content?: {
      parts?: Array<{
        text: string
      }>
      role?: string
    }
    finishReason?: string
    index?: number
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount?: number
    totalTokenCount: number
    promptTokensDetails?: Array<{
      modality: string
      tokenCount: number
    }>
    thoughtsTokenCount?: number
  }
  modelVersion?: string
  responseId?: string
}

interface GeminiAPIError {
  error: {
    code: number
    message: string
    details?: unknown[]
  }
}

export class GeminiProvider extends BaseAIProvider {
  private apiKey: string
  private model: GeminiModel
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models'
  private lastTokenUsage: TokenInfo | null = null

  constructor(apiKey: string, model: GeminiModel) {
    super()
    this.apiKey = apiKey
    this.model = model
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    if (!this.apiKey) {
      throw this.createError('INVALID_API_KEY', 'API key is required for Gemini provider')
    }

    // API可用性をテスト
    const isAvailable = await this.checkAvailability()
    if (!isAvailable) {
      throw this.createError('UNAVAILABLE', 'Gemini API is not available')
    }

    this.initialized = true
    console.log('Gemini provider initialized successfully')
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'test'
              }]
            }],
            generationConfig: {
              maxOutputTokens: 10,
              temperature: 0.1
            }
          })
        }
      )

      // 401や403以外のエラーでも、APIが反応していれば利用可能とみなす
      return response.status !== 404
    } catch (error) {
      console.error('Gemini API availability check failed:', error)
      return false
    }
  }

  async analyzeContent(
    prompt: string, 
    content: string, 
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    await this.ensureInitialized()

    const requestBody = {
      contents: [{
        parts: [{
          text: `${prompt}\n\n以下のHTML内容を処理してください：\n\n${content}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 10,
        maxOutputTokens: 4096,
        candidateCount: 1,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH'
        }
      ]
    }

    try {
      console.log(`Making request to Gemini ${this.model}...`)
      console.log('Request prompt length:', prompt.length)
      console.log('Request content length:', content.length)
      console.log('Total request body size:', JSON.stringify(requestBody).length)
      
      const response = await fetch(
        `${this.baseUrl}/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: options?.signal,
        }
      )
      
      console.log('Gemini API response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: GeminiAPIError | null = null
        
        try {
          errorData = JSON.parse(errorText)
        } catch {
          // JSON parse failed
        }

        const errorMessage = this.getErrorMessage(response.status, errorData)
        throw this.createError(
          `GEMINI_API_ERROR_${response.status}`,
          errorMessage,
          errorText
        )
      }

      const data: GeminiAPIResponse = await response.json()

      // レスポンス検証
      if (!data.candidates || data.candidates.length === 0) {
        throw this.createError(
          'INVALID_RESPONSE',
          'No candidates in response',
          JSON.stringify(data)
        )
      }

      const candidate = data.candidates[0]
      
      // finishReasonをチェック
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw this.createError(
          'TOKEN_LIMIT_EXCEEDED',
          'Gemini APIのトークン制限に達しました。コンテンツが大きすぎます。',
          JSON.stringify(candidate)
        )
      }
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw this.createError(
          'GENERATION_FAILED',
          `Generation finished with reason: ${candidate.finishReason}`,
          JSON.stringify(candidate)
        )
      }

      // コンテンツの存在確認
      if (!candidate.content) {
        throw this.createError(
          'INVALID_RESPONSE',
          'No content in response candidate',
          JSON.stringify(candidate)
        )
      }

      // partsが存在する場合の処理
      if (candidate.content.parts && candidate.content.parts.length > 0) {
        const resultText = candidate.content.parts[0].text
        
        // トークン使用量を更新
        if (data.usageMetadata) {
          this.lastTokenUsage = {
            used: data.usageMetadata.totalTokenCount,
            quota: 1000000, // Gemini APIの仮想的な制限値
            remaining: 1000000 - data.usageMetadata.totalTokenCount,
          }
        }
        
        if (!resultText || resultText.trim().length === 0) {
          throw this.createError(
            'EMPTY_RESPONSE',
            'Empty response from Gemini API',
            JSON.stringify(candidate)
          )
        }

        console.log('Gemini analysis completed:', {
          model: this.model,
          responseLength: resultText.length,
          tokensUsed: data.usageMetadata?.totalTokenCount,
        })

        return resultText
      } else {
        // partsが存在しない場合（新しいレスポンス形式対応）
        throw this.createError(
          'INVALID_RESPONSE',
          'Unsupported response format - no parts in content',
          JSON.stringify(candidate)
        )
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Gemini request aborted by user')
        throw error
      }

      console.error('Gemini API request failed:', error)

      if (error instanceof Error && 'code' in error) {
        throw error // Re-throw our own errors
      }

      throw this.createError(
        'REQUEST_FAILED',
        `Failed to analyze content: ${error instanceof Error ? error.message : 'Unknown error'}`,
        String(error)
      )
    }
  }

  getTokenInfo(): TokenInfo | null {
    return this.lastTokenUsage
  }

  destroy(): void {
    this.initialized = false
    this.lastTokenUsage = null
    console.log('Gemini provider destroyed')
  }

  getProviderName(): string {
    return `Google Gemini API (${this.model})`
  }

  getProviderDescription(): string {
    return `Using ${this.model} via Google AI Studio API`
  }

  // 設定更新メソッド
  updateConfig(apiKey: string, model: GeminiModel): void {
    this.apiKey = apiKey
    this.model = model
    this.initialized = false // 再初期化が必要
  }

  private getErrorMessage(status: number, errorData: GeminiAPIError | null): string {
    const apiErrorMessage = errorData?.error?.message

    switch (status) {
      case 400:
        return apiErrorMessage || 'リクエストが無効です。プロンプトまたはコンテンツを確認してください。'
      case 401:
        return 'APIキーが無効です。Google AI Studioで正しいAPIキーを確認してください。'
      case 403:
        return 'APIアクセスが拒否されました。APIキーの権限を確認してください。'
      case 404:
        return `指定されたモデル「${this.model}」が見つかりません。`
      case 429:
        return 'APIリクエスト制限に達しました。しばらく待ってから再試行してください。'
      case 500:
        return 'Gemini APIサーバーでエラーが発生しました。'
      case 503:
        return 'Gemini APIサービスが一時的に利用できません。'
      default:
        return apiErrorMessage || `APIエラーが発生しました (HTTP ${status})`
    }
  }
}