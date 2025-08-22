/// <reference path="../shared/types/chrome-ai.d.ts" />
import type { AIAvailability, AIError, AIAnalysisResult } from '../shared/types/chrome-ai'

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
        case 'downloadable':
          return 'downloadable'
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
        throw this.createError(
          'NOT_AVAILABLE',
          'Chrome AI APIは利用できません。Chrome 138以降でフラグを有効にしてください。'
        )
      }

      if (availability === 'after-download') {
        throw this.createError('DOWNLOAD_REQUIRED', 'AIモデルのダウンロードが必要です。')
      }

      if (typeof LanguageModel === 'undefined') {
        throw this.createError('NOT_AVAILABLE', 'LanguageModel APIが見つかりません。')
      }

      console.log('Creating AI session...')
      this.session = await LanguageModel.create({
        initialPrompts: [
          {
            role: 'system',
            content: `あなたは日本語校正の専門家です。

テキストの誤字・脱字・文法エラー・不自然な表現を見つけて、修正案を提示してください。

問題が見つかった場合は、以下の形式で回答してください：
間違い：「○○」→ 修正案：「○○」

問題がない場合は「問題ありません」と答えてください。`,
          },
        ],
      })

      console.log('AI session created successfully')
    } catch (error) {
      console.error('Failed to initialize AI session:', error)
      throw error
    } finally {
      this.isInitializing = false
    }
  }

  async analyzeText(text: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (!this.session) {
      await this.initialize()
    }

    if (!this.session) {
      throw this.createError('SESSION_FAILED', 'AIセッションの作成に失敗しました。')
    }

    try {
      const prompt = `このテキストを校正してください。問題があれば指摘し、修正案を提示してください：

${text}`
      const response = await this.session.prompt(prompt, options)
      return response
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Analysis aborted by user')
        throw error
      }
      console.error('Failed to analyze text:', error)
      throw this.createError('PROMPT_FAILED', 'テキスト分析に失敗しました。')
    }
  }

  async *analyzeTextStreaming(
    text: string,
    onChunk?: (data: { chunk: string; partialErrors: any[]; progress: number }) => void,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<{ chunk: string; partialErrors: any[]; isComplete: boolean }> {
    if (!this.session) {
      await this.initialize()
    }

    if (!this.session) {
      throw this.createError('SESSION_FAILED', 'AIセッションの作成に失敗しました。')
    }

    try {
      const prompt = `このテキストを校正してください。問題があれば指摘し、修正案を提示してください：

${text}`
      console.log('Starting streaming analysis...')

      const stream = this.session.promptStreaming(prompt, options)
      let previousText = ''
      let chunkCount = 0

      for await (const chunk of stream) {
        chunkCount++

        // Chrome AI APIのバグ対応: 各チャンクは累積的なので差分を計算
        const newText = chunk.slice(previousText.length)
        const isComplete = this.isResponseComplete(chunk)

        // 進捗計算
        const progress = isComplete ? 100 : Math.min(10 + chunkCount * 5, 90)

        // コールバックで通知
        if (onChunk) {
          onChunk({
            chunk: newText,
            partialErrors: [],
            progress,
          })
        }

        // ジェネレータで yield
        yield {
          chunk: newText,
          partialErrors: [],
          isComplete,
        }

        previousText = chunk

        if (isComplete) {
          break
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Streaming analysis aborted by user')
        throw error
      }
      console.error('Failed to analyze text streaming:', error)
      throw this.createError('PROMPT_FAILED', 'ストリーミングテキスト分析に失敗しました。')
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

  getTokensInfo(): { used: number; quota: number; remaining: number } | null {
    if (!this.session) return null

    return {
      used: this.session.inputUsage || 0,
      quota: this.session.inputQuota || 0,
      remaining: (this.session.inputQuota || 0) - (this.session.inputUsage || 0),
    }
  }

  async initiateModelDownload(): Promise<void> {
    console.log('Starting AI model download...')

    // ダウンロード開始を通知
    chrome.runtime.sendMessage({
      type: 'MODEL_DOWNLOAD_START',
      data: {
        message: 'AIモデルのダウンロードを開始しています...',
      },
    })

    try {
      const availability = await this.checkAvailability()

      if (availability === 'downloadable') {
        // モデルのダウンロードを開始（セッション作成によってトリガーされる）
        console.log('Creating session to trigger model download...')
        const session = await LanguageModel.create({
          initialPrompts: [
            {
              role: 'system',
              content: 'AI model initialization for TypoChecker.',
            },
          ],
        })

        console.log('Model download completed successfully')
        session.destroy()

        // ダウンロード完了を通知
        chrome.runtime.sendMessage({
          type: 'MODEL_DOWNLOAD_COMPLETE',
          data: {
            message: 'AIモデルのダウンロードが完了しました！',
            success: true,
          },
        })
      } else if (availability === 'readily') {
        // すでに利用可能
        chrome.runtime.sendMessage({
          type: 'MODEL_DOWNLOAD_COMPLETE',
          data: {
            message: 'AIモデルは既に利用可能です',
            success: true,
          },
        })
      } else {
        throw new Error(`Model download cannot be initiated. Availability: ${availability}`)
      }
    } catch (error) {
      console.error('Model download failed:', error)

      chrome.runtime.sendMessage({
        type: 'MODEL_DOWNLOAD_ERROR',
        data: {
          message: 'AIモデルのダウンロードに失敗しました',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      throw error
    }
  }

  private isResponseComplete(text: string): boolean {
    // テキスト出力用の簡単な完了判定
    const trimmed = text.trim()
    return (
      trimmed.length > 10 && // 最低限の長さがある
      (trimmed.includes('問題ありません') || // 問題なしパターン
       trimmed.includes('修正案：') || // 問題ありパターン
       trimmed.endsWith('。') || // 文として完了
       trimmed.endsWith('です') ||
       trimmed.endsWith('ます'))
    )
  }

  private createError(code: AIError['code'], message: string): AIError {
    return { code, message }
  }
}
