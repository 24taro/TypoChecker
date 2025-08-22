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
        initialPrompts: [{
          role: 'system',
          content: `あなたは日本語の文章校正アシスタントです。
与えられたテキストから以下を検出してください：
1. タイポ（誤字）
2. 文法エラー
3. 日本語として不自然な表現

結果は以下のJSON形式で返してください：
{
  "errors": [
    {
      "type": "typo" | "grammar" | "japanese",
      "severity": "error" | "warning" | "info",
      "original": "元のテキスト",
      "suggestion": "修正案",
      "context": "周辺のテキスト（オプション）"
    }
  ]
}

エラーが見つからない場合は空の配列を返してください。
必ず有効なJSONを返してください。`
        }],
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

  async analyzeText(text: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (!this.session) {
      await this.initialize()
    }

    if (!this.session) {
      throw this.createError('SESSION_FAILED', 'AIセッションの作成に失敗しました。')
    }

    try {
      const prompt = `以下のテキストを分析してエラーを検出してください：\n\n${text}`
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
      const prompt = `以下のテキストを分析してエラーを検出してください：\n\n${text}`
      console.log('Starting streaming analysis...')
      
      const stream = this.session.promptStreaming(prompt, options)
      let previousText = ''
      let chunkCount = 0

      for await (const chunk of stream) {
        chunkCount++
        
        // Chrome AI APIのバグ対応: 各チャンクは累積的なので差分を計算
        const newText = chunk.slice(previousText.length)
        const isComplete = this.isResponseComplete(chunk)
        
        console.log(`📡 AI Session chunk ${chunkCount}:`, {
          cumulativeLength: chunk.length,
          newTextLength: newText.length,
          newText: newText.substring(0, 50) + (newText.length > 50 ? '...' : ''),
          fullChunk: chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''),
          isComplete
        })
        
        // 部分的なエラーを解析
        const partialErrors = this.tryParsePartialErrors(chunk)
        console.log(`🔍 Partial error parsing result:`, {
          errorsFound: partialErrors.length,
          errors: partialErrors
        })
        
        // 進捗計算（完了かどうかで判定）
        const progress = isComplete ? 100 : Math.min(10 + chunkCount * 5, 90)
        
        const chunkData = {
          chunk: newText,
          partialErrors,
          progress
        }

        // コールバックで通知
        if (onChunk) {
          onChunk(chunkData)
        }

        // ジェネレータで yield
        yield {
          chunk: newText,
          partialErrors,
          isComplete
        }

        previousText = chunk

        if (isComplete) {
          console.log('✅ AI Streaming analysis completed')
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
        message: 'AIモデルのダウンロードを開始しています...'
      }
    })

    try {
      const availability = await this.checkAvailability()
      
      if (availability === 'downloadable') {
        // モデルのダウンロードを開始（セッション作成によってトリガーされる）
        console.log('Creating session to trigger model download...')
        const session = await LanguageModel.create({
          initialPrompts: [{
            role: 'system',
            content: 'AI model initialization for TypoChecker.'
          }]
        })
        
        console.log('Model download completed successfully')
        session.destroy()
        
        // ダウンロード完了を通知
        chrome.runtime.sendMessage({
          type: 'MODEL_DOWNLOAD_COMPLETE',
          data: {
            message: 'AIモデルのダウンロードが完了しました！',
            success: true
          }
        })
      } else if (availability === 'readily') {
        // すでに利用可能
        chrome.runtime.sendMessage({
          type: 'MODEL_DOWNLOAD_COMPLETE',
          data: {
            message: 'AIモデルは既に利用可能です',
            success: true
          }
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
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      
      throw error
    }
  }

  private isResponseComplete(text: string): boolean {
    // JSONの完了を確認（閉じ括弧があり、構造が完整している）
    const openBraces = (text.match(/\{/g) || []).length
    const closeBraces = (text.match(/\}/g) || []).length
    const openBrackets = (text.match(/\[/g) || []).length
    const closeBrackets = (text.match(/\]/g) || []).length
    
    const hasErrors = text.includes('"errors"')
    const endsWithBrace = text.trim().endsWith('}')
    const isComplete = openBraces > 0 && closeBraces > 0 && 
                      openBraces === closeBraces && openBrackets === closeBrackets && 
                      hasErrors && endsWithBrace
    
    console.log('🏁 Completion check:', {
      openBraces, closeBraces, openBrackets, closeBrackets,
      hasErrors, endsWithBrace, isComplete,
      textEnd: text.slice(-20)
    })
    
    return isComplete
  }

  private tryParsePartialErrors(text: string): any[] {
    const errors: any[] = []
    console.log('🔍 Trying to parse partial errors from text:', text.substring(0, 150) + '...')
    
    try {
      // 完全なJSONとして解析を試行
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        console.log('💡 Found JSON match, attempting to parse:', jsonMatch[0].substring(0, 100) + '...')
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.errors && Array.isArray(parsed.errors)) {
          console.log('✅ Successfully parsed complete JSON with errors:', parsed.errors.length)
          return parsed.errors
        }
      }
    } catch (e) {
      console.log('❌ Complete JSON parsing failed:', e instanceof Error ? e.message : 'Unknown error')
    }

    // 部分的なエラー要素を正規表現で抽出
    const errorPattern = /\{\s*"type":\s*"(typo|grammar|japanese)",\s*"severity":\s*"(error|warning|info)",\s*"original":\s*"([^"]*)",\s*"suggestion":\s*"([^"]*)"\s*(?:,\s*"(?:context|explanation)":\s*"[^"]*")?\s*\}/g
    
    let match
    let regexMatches = 0
    while ((match = errorPattern.exec(text)) !== null) {
      regexMatches++
      try {
        const errorObj = JSON.parse(match[0])
        console.log(`📋 Regex match ${regexMatches} parsed:`, errorObj)
        errors.push(errorObj)
      } catch {
        console.log(`❌ Regex match ${regexMatches} failed to parse:`, match[0])
        continue
      }
    }

    // より簡単なパターンでも試行
    if (errors.length === 0) {
      console.log('🔍 Trying simple pattern extraction...')
      const simplePattern = /"type":\s*"(typo|grammar|japanese)"[^}]*?"suggestion":\s*"([^"]*)"/g
      let simpleMatches = 0
      while ((match = simplePattern.exec(text)) !== null) {
        simpleMatches++
        const simpleError = {
          type: match[1],
          severity: 'warning',
          original: '',
          suggestion: match[2]
        }
        console.log(`📌 Simple pattern match ${simpleMatches}:`, simpleError)
        errors.push(simpleError)
      }
    }

    console.log(`🎯 Final partial error count: ${errors.length}`)
    return errors
  }

  private createError(code: AIError['code'], message: string): AIError {
    return { code, message }
  }
}