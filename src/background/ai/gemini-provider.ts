import { GoogleGenAI } from '@google/genai'
import type { GeminiModel } from '../../shared/types/settings'
import { BaseAIProvider, type TokenInfo, type AIProviderError } from './ai-provider'

export class GeminiProvider extends BaseAIProvider {
  private ai: GoogleGenAI
  private modelName: GeminiModel
  private lastTokenUsage: TokenInfo | null = null

  constructor(apiKey: string, model: GeminiModel) {
    super()
    this.ai = new GoogleGenAI({ apiKey })
    this.modelName = model
  }

  private getModelName(model: GeminiModel): string {
    // 2025年8月現在の正式なモデル名（安定版として利用可能）
    switch (model) {
      case 'gemini-2.5-flash':
        return 'gemini-2.5-flash'  // 安定版として利用可能
      case 'gemini-2.5-pro':
        return 'gemini-2.5-pro'    // 安定版として利用可能
      default:
        return model
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

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
      // SDKを使って簡単なテストリクエストを送信
      await this.ai.models.generateContent({
        model: this.getModelName(this.modelName),
        contents: 'test',
        config: {
          maxOutputTokens: 10,
          temperature: 0.1
        }
      })
      return true
    } catch (error) {
      console.error('Gemini API availability check failed:', error)
      // エラーの場合、404以外は利用可能とみなす
      if (error && typeof error === 'object' && 'status' in error) {
        return (error as any).status !== 404
      }
      return false
    }
  }

  async analyzeContent(
    prompt: string, 
    content: string, 
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    await this.ensureInitialized()

    // コンテンツサイズをチェック（File API使用判定）
    const contentSize = new Blob([content]).size

    try {
      console.log(`Making request to Gemini ${this.modelName}...`)
      console.log('Request prompt length:', prompt.length)
      console.log('Request content size:', contentSize)

      let result: string

      if (contentSize > 100_000) { // 100KB以上はFile API使用
        console.log('Using File API for large content')
        result = await this.analyzeWithFileAPI(prompt, content, options)
      } else {
        console.log('Using direct content analysis')
        result = await this.analyzeWithDirectContent(prompt, content, options)
      }

      console.log('Analysis completed, result length:', result.length)
      return result

    } catch (error) {
      console.error('Gemini API request failed:', error)
      
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any
        const errorMessage = this.getSDKErrorMessage(apiError)
        throw this.createError(
          `GEMINI_SDK_ERROR_${apiError.status}`,
          errorMessage,
          apiError.message
        )
      }

      throw this.createError(
        'GEMINI_UNKNOWN_ERROR',
        '不明なエラーが発生しました',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  private async analyzeWithDirectContent(
    prompt: string, 
    content: string,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.getModelName(this.modelName),
      contents: `${prompt}\n\n以下のHTML内容を処理してください：\n\n${content}`,
      config: {
        temperature: 0.7,
        topK: 10,
        maxOutputTokens: 4096,
        candidateCount: 1,
      }
    })

    // トークン使用状況を更新
    this.updateTokenUsage(response)

    const result = response.text
    if (!result || result.trim().length === 0) {
      throw this.createError(
        'EMPTY_RESPONSE',
        'Empty response from Gemini API',
        'No text content in response'
      )
    }

    return result
  }

  private async analyzeWithFileAPI(
    prompt: string, 
    content: string,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    // ai-managerから現在のcontentLevelを取得する必要がある
    // 一時的にbackground/index.tsのprocessContentByLevel結果の形式で判定
    const { blob, mimeType, displayName } = this.prepareFileContent(content)
    
    // File APIを使ってファイルをアップロード
    const file = await this.ai.files.upload({
      file: blob,
      config: {
        displayName: displayName,
        mimeType: mimeType
      }
    })

    console.log('File uploaded:', file.name, 'URI:', file.uri, 'MIME:', mimeType)

    try {
      // ファイルがACTIVE状態になるまで待機
      if (!file.name) {
        throw this.createError('FILE_UPLOAD_ERROR', 'ファイルアップロード後にファイル名が取得できませんでした', '')
      }
      await this.waitForFileActive(file.name)

      // ファイルを参照してコンテンツ生成（正しいファイル参照形式）
      if (!file.uri) {
        throw this.createError('FILE_UPLOAD_ERROR', 'ファイルアップロード後にファイルURIが取得できませんでした', '')
      }
      
      const response = await this.ai.models.generateContent({
        model: this.getModelName(this.modelName),
        contents: [
          { text: prompt },
          { 
            fileData: { 
              fileUri: file.uri, 
              mimeType: mimeType 
            } 
          }
        ],
        config: {
          temperature: 0.7,
          topK: 10,
          maxOutputTokens: 4096,
          candidateCount: 1,
        }
      })

      // トークン使用状況を更新
      this.updateTokenUsage(response)

      const result = response.text
      if (!result || result.trim().length === 0) {
        throw this.createError(
          'EMPTY_RESPONSE',
          'Empty response from Gemini File API',
          'No text content in response'
        )
      }

      return result

    } finally {
      // ファイルをクリーンアップ（48時間後に自動削除されるが、明示的に削除）
      try {
        if (file.name) {
          await this.ai.files.delete({ name: file.name })
          console.log('Temporary file deleted:', file.name)
        }
      } catch (deleteError) {
        console.warn('Failed to delete temporary file:', deleteError)
      }
    }
  }

  private async waitForFileActive(fileName: string, maxWaitTime = 30000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const fileInfo = await this.ai.files.get({ name: fileName })
        
        console.log('File state:', fileInfo.state)
        
        if (fileInfo.state === 'ACTIVE') {
          console.log('File is ready for use')
          return
        }
        
        if (fileInfo.state === 'FAILED') {
          throw this.createError(
            'FILE_PROCESSING_FAILED',
            'ファイルの処理に失敗しました',
            `File state: ${fileInfo.state}`
          )
        }
        
        // 1秒待機してから再確認
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        if (Date.now() - startTime > maxWaitTime - 1000) {
          // タイムアウト直前の場合はエラーを投げる
          throw this.createError(
            'FILE_WAIT_TIMEOUT',
            'ファイルの準備待ちタイムアウト',
            error instanceof Error ? error.message : 'Unknown error'
          )
        }
        // それ以外は再試行
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    throw this.createError(
      'FILE_WAIT_TIMEOUT',
      'ファイルの準備待ちタイムアウトしました',
      `Waited ${maxWaitTime}ms for file to become active`
    )
  }

  private prepareFileContent(content: string): { blob: Blob; mimeType: string; displayName: string } {
    // コンテンツの内容を分析して適切なmimeTypeを決定
    const hasHtmlTags = /<[^>]+>/g.test(content)
    const hasCssContent = /<style[^>]*>[\s\S]*?<\/style>/gi.test(content) || /\.[a-zA-Z-]+\s*\{[\s\S]*?\}/g.test(content)
    const hasJsContent = /<script[^>]*>[\s\S]*?<\/script>/gi.test(content)
    const isMarkdown = /^#{1,6}\s+/gm.test(content) || /^\*\*[^*]+\*\*|^\*[^*]+\*/gm.test(content) || /^\[.+\]\(.+\)/gm.test(content)

    let mimeType: string
    let extension: string
    let contentType: string

    if (isMarkdown && !hasHtmlTags) {
      // マークダウンコンテンツ
      mimeType = 'text/markdown'
      extension = 'md'
      contentType = 'markdown'
    } else if (hasHtmlTags) {
      if (hasJsContent && hasCssContent) {
        // HTML + CSS + JavaScript
        mimeType = 'text/html'
        extension = 'html'
        contentType = 'html-css-js'
      } else if (hasCssContent) {
        // HTML + CSS
        mimeType = 'text/html'
        extension = 'html'
        contentType = 'html-css'
      } else {
        // HTML のみ
        mimeType = 'text/html'
        extension = 'html'
        contentType = 'html-only'
      }
    } else {
      // プレーンテキスト
      mimeType = 'text/plain'
      extension = 'txt'
      contentType = 'text-only'
    }

    const blob = new Blob([content], { type: mimeType })
    const displayName = `page-content-${Date.now()}-${contentType}.${extension}`

    console.log('Content analysis:', { contentType, mimeType, size: blob.size })

    return { blob, mimeType, displayName }
  }

  private updateTokenUsage(response: any): void {
    if (response.usageMetadata) {
      const usage = response.usageMetadata
      this.lastTokenUsage = {
        used: usage.totalTokenCount || 0,
        quota: 1000000, // Gemini APIの仮想的な制限値
        remaining: 1000000 - (usage.totalTokenCount || 0),
      }
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

  // ストリーミング分析機能（SDK対応）
  async *analyzeContentStream(prompt: string, content: string): AsyncIterable<string> {
    await this.ensureInitialized()

    try {
      console.log(`Starting streaming analysis with Gemini ${this.modelName}...`)

      const response = await this.ai.models.generateContentStream({
        model: this.getModelName(this.modelName),
        contents: `${prompt}\n\n以下のHTML内容を処理してください：\n\n${content}`,
        config: {
          temperature: 0.7,
          topK: 10,
          maxOutputTokens: 4096,
          candidateCount: 1,
        }
      })

      for await (const chunk of response) {
        const text = chunk.text
        if (text) {
          yield text
        }
      }

      console.log('Streaming analysis completed')

    } catch (error) {
      console.error('Streaming analysis failed:', error)
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any
        throw this.createError(
          `GEMINI_STREAM_ERROR_${apiError.status}`,
          this.getSDKErrorMessage(apiError),
          apiError.message
        )
      }
      throw error
    }
  }

  getProviderName(): string {
    return `Google Gemini API (${this.modelName})`
  }

  getProviderDescription(): string {
    return `Using ${this.modelName} via Google AI Studio API`
  }

  // 設定更新メソッド
  updateConfig(apiKey: string, model: GeminiModel): void {
    this.ai = new GoogleGenAI({ apiKey })
    this.modelName = model
    this.initialized = false // 再初期化が必要
  }

  private getSDKErrorMessage(error: any): string {
    switch (error.status) {
      case 400:
        return 'リクエストが無効です。プロンプトまたはコンテンツを確認してください。'
      case 401:
        return 'APIキーが無効です。Google AI Studioで正しいAPIキーを確認してください。'
      case 403:
        return 'APIアクセスが拒否されました。APIキーの権限を確認してください。'
      case 404:
        return `指定されたモデル「${this.modelName}」が見つかりません。`
      case 429:
        return 'APIリクエスト制限に達しました。しばらく待ってから再試行してください。'
      case 500:
        return 'Gemini APIサーバーでエラーが発生しました。'
      case 503:
        return 'Gemini APIサービスが一時的に利用できません。'
      default:
        return error.message || `APIエラーが発生しました (HTTP ${error.status})`
    }
  }
}