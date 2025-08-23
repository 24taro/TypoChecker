import { GoogleGenAI } from '@google/genai'
import type { GeminiModel } from '../../shared/types/settings'
import {
  BaseAIProvider,
  type TokenInfo,
  type AIProviderError,
  type StreamOptions,
  type StreamChunk,
} from './ai-provider'

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
    switch (model) {
      case 'gemini-2.5-flash':
        return 'gemini-2.5-flash'
      case 'gemini-2.5-pro':
        return 'gemini-2.5-pro'
      default:
        return model
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    const isAvailable = await this.checkAvailability()
    if (!isAvailable) {
      throw this.createError('UNAVAILABLE', 'Gemini API is not available')
    }

    this.initialized = true
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await this.ai.models.generateContent({
        model: this.getModelName(this.modelName),
        contents: 'test',
        config: {
          maxOutputTokens: 50,
          temperature: 0.1,
        },
      })
      return true
    } catch (error) {
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

    const contentSize = new Blob([content]).size
    const shouldUseFileAPI = this.shouldUseFileAPI(content, contentSize)

    try {
      let result: string

      if (shouldUseFileAPI) {
        try {
          result = await this.analyzeWithFileAPI(prompt, content, options)
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'TOKEN_LIMIT_EXCEEDED'
          ) {
            result = await this.analyzeWithDirectContent(prompt, content, options)
          } else {
            throw error
          }
        }
      } else {
        result = await this.analyzeWithDirectContent(prompt, content, options)
      }

      return result
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && 'userMessage' in error) {
        throw error
      }

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

  async analyzeContentStream(
    prompt: string,
    content: string,
    chatHistory?: any[],
    options?: StreamOptions
  ): Promise<void> {
    const contentSize = new Blob([content]).size

    try {
      if (this.shouldUseFileAPI(content, contentSize)) {
        await this.analyzeWithFileAPIStream(prompt, content, chatHistory, options)
      } else {
        await this.analyzeWithDirectContentStream(prompt, content, chatHistory, options)
      }
    } catch (error) {
      if (options?.onError) {
        if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
          options.onError(error as AIProviderError)
        } else if (error && typeof error === 'object' && 'status' in error) {
          const apiError = error as any
          const errorMessage = this.getSDKErrorMessage(apiError)
          options.onError(
            this.createError(`GEMINI_SDK_ERROR_${apiError.status}`, errorMessage, apiError.message)
          )
        } else {
          options.onError(
            this.createError(
              'GEMINI_UNKNOWN_ERROR',
              '不明なエラーが発生しました',
              error instanceof Error ? error.message : 'Unknown error'
            )
          )
        }
      }
      throw error
    }
  }

  private shouldUseFileAPI(content: string, contentSize: number): boolean {
    return contentSize > 100_000 // 100KB以上でFile API使用
  }

  private async analyzeWithDirectContent(
    prompt: string,
    content: string,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    const structuredPrompt = `ユーザーリクエスト:
${prompt}

対象コンテンツ:
${content}

上記のコンテンツに対してユーザーリクエストを実行してください。`

    const response = await this.ai.models.generateContent({
      model: this.getModelName(this.modelName),
      contents: structuredPrompt,
      config: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 32768,
        candidateCount: 1,
      },
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
    const { blob, mimeType, displayName } = this.prepareFileContent(content)

    const file = await this.ai.files.upload({
      file: blob,
      config: {
        displayName: displayName,
        mimeType: mimeType,
      },
    })

    try {
      // ファイルがACTIVE状態になるまで待機
      if (!file.name) {
        throw this.createError(
          'FILE_UPLOAD_ERROR',
          'ファイルアップロード後にファイル名が取得できませんでした',
          ''
        )
      }
      await this.waitForFileActive(file.name)

      // ファイルを参照してコンテンツ生成（正しいファイル参照形式）
      if (!file.uri) {
        throw this.createError(
          'FILE_UPLOAD_ERROR',
          'ファイルアップロード後にファイルURIが取得できませんでした',
          ''
        )
      }

      const structuredPrompt = `ユーザーリクエスト: ${prompt}

添付されたファイルのコンテンツに対して、上記のユーザーリクエストを実行してください。`

      const response = await this.ai.models.generateContent({
        model: this.getModelName(this.modelName),
        contents: [
          { text: structuredPrompt },
          {
            fileData: {
              fileUri: file.uri,
              mimeType: mimeType,
            },
          },
        ],
        config: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 32768,
          candidateCount: 1,
        },
      })

      // トークン使用状況を更新
      this.updateTokenUsage(response)

      const result = response.text

      // response.textが空の場合、MAX_TOKENSエラーかどうかチェック
      if (!result || result.trim().length === 0) {
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0]

          // MAX_TOKENSの場合は即座にエラーにする
          if (candidate.finishReason === 'MAX_TOKENS') {
            const contentSize = new Blob([content]).size
            throw this.createError(
              'TOKEN_LIMIT_EXCEEDED',
              'コンテンツが大きすぎてGeminiAPIのトークン制限に達しました。',
              `MAX_TOKENS reached with ${contentSize} bytes content`
            )
          }

          // その他のfinishReasonでも適切にエラー処理
          if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            throw this.createError(
              'GENERATION_FAILED',
              `レスポンス生成が異常終了しました: ${candidate.finishReason}`,
              `Finish reason: ${candidate.finishReason}`
            )
          }
        }
      }

      if (!result || result.trim().length === 0) {
        throw this.createError(
          'EMPTY_RESPONSE',
          'Empty response from Gemini File API',
          `No text content in response. Response keys: ${Object.keys(response).join(', ')}`
        )
      }

      return result
    } finally {
      try {
        if (file.name) {
          await this.ai.files.delete({ name: file.name })
        }
      } catch (deleteError) {
        // Ignore cleanup errors
      }
    }
  }

  private async waitForFileActive(fileName: string, maxWaitTime = 30000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const fileInfo = await this.ai.files.get({ name: fileName })

        if (fileInfo.state === 'ACTIVE') {
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
        await new Promise((resolve) => setTimeout(resolve, 1000))
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
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    throw this.createError(
      'FILE_WAIT_TIMEOUT',
      'ファイルの準備待ちタイムアウトしました',
      `Waited ${maxWaitTime}ms for file to become active`
    )
  }

  private prepareFileContent(content: string): {
    blob: Blob
    mimeType: string
    displayName: string
  } {
    const hasHtmlTags = /<[^>]+>/g.test(content)
    const hasCssContent =
      /<style[^>]*>[\s\S]*?<\/style>/gi.test(content) ||
      /\.[a-zA-Z-]+\s*\{[\s\S]*?\}/g.test(content)
    const hasJsContent = /<script[^>]*>[\s\S]*?<\/script>/gi.test(content)
    const isMarkdown =
      /^#{1,6}\s+/gm.test(content) ||
      /^\*\*[^*]+\*\*|^\*[^*]+\*/gm.test(content) ||
      /^\[.+\]\(.+\)/gm.test(content)

    let mimeType: string
    let extension: string
    let contentType: string

    if (isMarkdown && !hasHtmlTags) {
      mimeType = 'text/markdown'
      extension = 'md'
      contentType = 'markdown'
    } else if (hasHtmlTags) {
      if (hasJsContent && hasCssContent) {
        mimeType = 'text/html'
        extension = 'html'
        contentType = 'html-css-js'
      } else if (hasCssContent) {
        mimeType = 'text/html'
        extension = 'html'
        contentType = 'html-css'
      } else {
        mimeType = 'text/html'
        extension = 'html'
        contentType = 'html-only'
      }
    } else {
      mimeType = 'text/plain'
      extension = 'txt'
      contentType = 'text-only'
    }

    const blob = new Blob([content], { type: mimeType })
    const displayName = `page-content-${Date.now()}-${contentType}.${extension}`

    return { blob, mimeType, displayName }
  }

  private updateTokenUsage(response: any): void {
    if (response.usageMetadata) {
      const usage = response.usageMetadata
      this.lastTokenUsage = {
        used: usage.totalTokenCount || 0,
        quota: 1000000,
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
  }

  getProviderName(): string {
    return `Google Gemini API (${this.modelName})`
  }

  getProviderDescription(): string {
    return `Using ${this.modelName} via Google AI Studio API`
  }

  updateConfig(apiKey: string, model: GeminiModel): void {
    this.ai = new GoogleGenAI({ apiKey })
    this.modelName = model
    this.initialized = false
  }

  private async analyzeWithDirectContentStream(
    prompt: string,
    content: string,
    chatHistory?: any[],
    options?: StreamOptions
  ): Promise<void> {
    // 会話履歴からGemini API用のcontents配列を構築
    const contents = this.buildContentsArray(prompt, content, chatHistory)

    try {
      const response = await this.ai.models.generateContentStream({
        model: this.getModelName(this.modelName),
        contents: contents,
        config: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 32768,
          candidateCount: 1,
        },
      })

      let fullText = ''
      let finalResponse: any = null

      for await (const chunk of response) {
        if (chunk.text) {
          fullText += chunk.text

          if (options?.onChunk) {
            options.onChunk({ text: chunk.text })
          }
        }
        // 最後のチャンクからレスポンスデータを取得
        finalResponse = chunk
      }

      // トークン使用状況を更新
      if (finalResponse) {
        this.updateTokenUsage(finalResponse)
      }

      if (options?.onComplete) {
        options.onComplete(fullText, this.getTokenInfo() || undefined)
      }
    } catch (error) {
      if (options?.onError) {
        if (error && typeof error === 'object' && 'status' in error) {
          const apiError = error as any
          options.onError(
            this.createError(
              `GEMINI_STREAM_ERROR_${apiError.status}`,
              this.getSDKErrorMessage(apiError),
              apiError.message
            )
          )
        } else {
          options.onError(
            this.createError(
              'GEMINI_STREAM_ERROR',
              'ストリーミング処理でエラーが発生しました',
              error instanceof Error ? error.message : 'Unknown error'
            )
          )
        }
      }
      throw error
    }
  }

  private async analyzeWithFileAPIStream(
    prompt: string,
    content: string,
    chatHistory?: any[],
    options?: StreamOptions
  ): Promise<void> {
    let file: any = null

    try {
      const { blob, mimeType, displayName } = this.prepareFileContent(content)

      file = await this.ai.files.upload({
        file: blob,
      })

      if (!file || !file.name) {
        throw this.createError('FILE_UPLOAD_ERROR', 'ファイルのアップロードに失敗しました', '')
      }

      await this.waitForFileActive(file.name)

      if (!file.uri) {
        throw this.createError(
          'FILE_UPLOAD_ERROR',
          'ファイルアップロード後にファイルURIが取得できませんでした',
          ''
        )
      }

      // 会話履歴からGemini API用のcontents配列を構築（ファイルAPI用）
      const contents = this.buildContentsArrayWithFile(prompt, file.uri, mimeType, chatHistory)

      const response = await this.ai.models.generateContentStream({
        model: this.getModelName(this.modelName),
        contents: contents,
        config: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 32768,
          candidateCount: 1,
        },
      })

      let fullText = ''
      let finalResponse: any = null

      for await (const chunk of response) {
        if (chunk.text) {
          fullText += chunk.text

          if (options?.onChunk) {
            options.onChunk({ text: chunk.text })
          }
        }
        // 最後のチャンクからレスポンスデータを取得
        finalResponse = chunk
      }

      // トークン使用状況を更新
      if (finalResponse) {
        this.updateTokenUsage(finalResponse)
      }

      if (options?.onComplete) {
        options.onComplete(fullText, this.getTokenInfo() || undefined)
      }
    } catch (error) {
      if (options?.onError) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        options.onError(
          this.createError(
            'GEMINI_FILE_STREAM_ERROR',
            'ファイルAPIストリーミング処理でエラーが発生しました',
            message
          )
        )
      }
      throw error
    } finally {
      try {
        if (file?.name) {
          await this.ai.files.delete({ name: file.name })
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup uploaded file:', cleanupError)
      }
    }
  }

  private buildContentsArray(prompt: string, content: string, chatHistory?: any[]): any[] {
    const contents: any[] = []

    console.log('===== GEMINI PROVIDER DEBUG =====')
    console.log('Chat history received:', chatHistory?.length || 0, 'messages')
    console.log('Content length:', content.length)
    console.log('Prompt:', prompt.substring(0, 100) + '...')
    
    if (chatHistory && chatHistory.length > 0) {
      console.log('Chat history details:')
      chatHistory.forEach((msg, i) => {
        console.log(`  ${i}: ${msg.role} - ${msg.content.substring(0, 50)}...`)
      })
      console.log('NOTE: Latest user message is already included in chat history, not adding separately')
    }

    // 会話履歴がある場合は、それを基にcontents配列を構築
    if (chatHistory && chatHistory.length > 0) {
      console.log('Building multi-turn conversation')
      // 過去の会話履歴をcontents配列に変換（最新のユーザーメッセージは既に履歴に含まれているので、それをそのまま使用）
      for (const message of chatHistory) {
        if (message.role === 'user' || message.role === 'assistant') {
          contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
          })
        }
      }
      
      // 会話履歴に既に最新のメッセージが含まれているので、追加で送信しない
      console.log('Multi-turn contents array built with', contents.length, 'entries')
    } else {
      console.log('Building first message with page content')
      // 初回の場合は、従来通りページコンテンツと一緒に送信
      const structuredPrompt = `ユーザーリクエスト:
${prompt}

対象コンテンツ:
${content}

上記のコンテンツに対してユーザーリクエストを実行してください。`

      contents.push({
        role: 'user',
        parts: [{ text: structuredPrompt }]
      })
      
      console.log('First message contents array built')
    }

    console.log('Final contents array structure:')
    contents.forEach((item, i) => {
      console.log(`  ${i}: role=${item.role}, text_length=${item.parts[0].text.length}`)
    })
    console.log('===== END GEMINI PROVIDER DEBUG =====')

    return contents
  }

  private buildContentsArrayWithFile(prompt: string, fileUri: string, mimeType: string, chatHistory?: any[]): any[] {
    const contents: any[] = []

    // 会話履歴がある場合は、それを基にcontents配列を構築
    if (chatHistory && chatHistory.length > 0) {
      // 過去の会話履歴をcontents配列に変換（最新のメッセージは既に履歴に含まれている）
      for (const message of chatHistory) {
        if (message.role === 'user' || message.role === 'assistant') {
          contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
          })
        }
      }
    } else {
      // 初回の場合は、ファイルと一緒に送信
      const structuredPrompt = `ユーザーリクエスト: ${prompt}

添付されたファイルのコンテンツに対して、上記のユーザーリクエストを実行してください。`

      contents.push({
        role: 'user',
        parts: [
          { text: structuredPrompt },
          {
            fileData: {
              fileUri: fileUri,
              mimeType: mimeType,
            },
          },
        ]
      })
    }

    return contents
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
