import type {
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
  GeminiContent,
  GeminiError,
} from '../shared/types/gemini-api'
import { StorageManager } from '../shared/storage'
import { PROMPTS } from '../shared/constants'

export class GeminiClient {
  private apiKey: string | null = null
  private readonly modelName = 'gemini-2.5-flash' // 最新のGemini 2.5 Flash固定
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  async initialize(): Promise<void> {
    this.apiKey = await StorageManager.getApiKey()
    
    if (!this.apiKey) {
      throw new Error('API Keyが設定されていません。拡張機能の設定からAPI Keyを入力してください。')
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await this.initialize()
      return !!this.apiKey
    } catch {
      return false
    }
  }

  async analyzeText(text: string): Promise<string> {
    if (!this.apiKey) {
      await this.initialize()
    }

    if (!this.apiKey) {
      throw new Error('API Keyが設定されていません')
    }

    const systemInstruction: GeminiContent = {
      role: 'system',
      parts: [{ text: PROMPTS.SYSTEM }]
    }

    const userContent: GeminiContent = {
      role: 'user',
      parts: [{ text: PROMPTS.USER_TEMPLATE(text) }]
    }

    const request: GeminiGenerateContentRequest = {
      systemInstruction,
      contents: [userContent],
      generationConfig: {
        temperature: 0.2,
        topK: 3,
        maxOutputTokens: 2048,
      }
    }

    try {
      console.log('=== GEMINI API REQUEST START ===')
      console.log('📤 Sending to Gemini API:', this.modelName)
      console.log('System:', systemInstruction.parts[0].text)
      console.log('User:', userContent.parts[0].text)
      console.log('=== GEMINI API REQUEST END ===')

      const response = await fetch(
        `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }
      )

      if (!response.ok) {
        const errorData = await response.json() as GeminiError
        console.error('Gemini API Error:', errorData)
        throw new Error(errorData.error?.message || 'API呼び出しに失敗しました')
      }

      const data = await response.json() as GeminiGenerateContentResponse
      
      console.log('=== GEMINI API RESPONSE START ===')
      console.log('📥 Response from Gemini API:')
      console.log('Candidates:', data.candidates?.length)
      
      if (data.usageMetadata) {
        console.log('Token usage:', {
          prompt: data.usageMetadata.promptTokenCount,
          response: data.usageMetadata.candidatesTokenCount,
          total: data.usageMetadata.totalTokenCount,
        })
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text
      
      if (!content) {
        throw new Error('レスポンスが空です')
      }

      console.log('Content:', content)
      console.log('=== GEMINI API RESPONSE END ===')

      return content
    } catch (error) {
      console.error('Failed to call Gemini API:', error)
      throw error
    }
  }

  getTokensInfo() {
    // Gemini APIでは個別のトークン情報は返さない
    return null
  }

  async destroy(): Promise<void> {
    // Gemini APIはセッションベースではないため、特に処理なし
  }
}