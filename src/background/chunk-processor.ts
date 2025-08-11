import { AI_MODEL, CHUNK_PROCESSING, ERROR_MESSAGES } from '../shared/constants'
import type { TypoError } from '../shared/types/messages'

export interface TextChunk {
  id: number
  text: string
  startIndex: number
  endIndex: number
  overlap?: string
}

export interface ChunkResult {
  chunkId: number
  errors: TypoError[]
  tokensUsed?: number
  processingTime: number
}

export class ChunkProcessor {
  private abortController: AbortController | null = null

  /**
   * テキストをチャンクに分割
   */
  splitIntoChunks(text: string): TextChunk[] {
    const chunks: TextChunk[] = []
    const maxChunkSize = AI_MODEL.MAX_CHARS_PER_CHUNK
    const overlapSize = AI_MODEL.OVERLAP_CHARS
    
    if (text.length <= maxChunkSize) {
      // テキストが短い場合は分割しない
      chunks.push({
        id: 0,
        text,
        startIndex: 0,
        endIndex: text.length,
      })
      return chunks
    }

    let startIndex = 0
    let chunkId = 0

    while (startIndex < text.length) {
      let endIndex = Math.min(startIndex + maxChunkSize, text.length)
      
      // 文章の区切りで分割するように調整
      if (endIndex < text.length) {
        const lastPeriod = text.lastIndexOf('。', endIndex)
        const lastNewline = text.lastIndexOf('\n', endIndex)
        const lastSpace = text.lastIndexOf(' ', endIndex)
        
        // 最も近い区切り位置を選択
        const breakPoint = Math.max(
          lastPeriod > startIndex ? lastPeriod + 1 : -1,
          lastNewline > startIndex ? lastNewline + 1 : -1,
          lastSpace > startIndex ? lastSpace + 1 : -1
        )
        
        if (breakPoint > startIndex) {
          endIndex = breakPoint
        }
      }

      // オーバーラップ部分を取得（次のチャンクの開始部分）
      let overlap: string | undefined
      if (chunkId > 0 && startIndex > 0) {
        const overlapStart = Math.max(0, startIndex - overlapSize)
        overlap = text.substring(overlapStart, startIndex)
      }

      chunks.push({
        id: chunkId,
        text: text.substring(startIndex, endIndex),
        startIndex,
        endIndex,
        overlap,
      })

      // 次のチャンクの開始位置（オーバーラップを考慮）
      startIndex = endIndex - overlapSize
      if (startIndex < 0) startIndex = endIndex
      
      chunkId++
    }

    return chunks
  }

  /**
   * チャンクをバッチ処理
   */
  async processChunks(
    chunks: TextChunk[],
    analyzeFunc: (text: string) => Promise<string>,
    onProgress?: (current: number, total: number) => void
  ): Promise<ChunkResult[]> {
    this.abortController = new AbortController()
    const results: ChunkResult[] = []
    const totalChunks = chunks.length

    // バッチごとに処理
    for (let i = 0; i < chunks.length; i += CHUNK_PROCESSING.BATCH_SIZE) {
      if (this.abortController.signal.aborted) {
        throw new Error('Processing aborted')
      }

      const batch = chunks.slice(i, i + CHUNK_PROCESSING.BATCH_SIZE)
      
      // バッチ内のチャンクを並列処理
      const batchPromises = batch.map(chunk => 
        this.processChunkWithRetry(chunk, analyzeFunc)
      )

      try {
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
        
        // 進捗を通知
        if (onProgress) {
          onProgress(Math.min(i + batch.length, totalChunks), totalChunks)
        }
      } catch (error) {
        console.error('Batch processing failed:', error)
        // 失敗したチャンクは空の結果として扱う
        batch.forEach(chunk => {
          results.push({
            chunkId: chunk.id,
            errors: [],
            processingTime: 0,
          })
        })
      }

      // 次のバッチまで少し待機（API制限を考慮）
      if (i + CHUNK_PROCESSING.BATCH_SIZE < chunks.length) {
        await this.delay(500)
      }
    }

    return results
  }

  /**
   * 単一チャンクの処理（リトライ付き）
   */
  private async processChunkWithRetry(
    chunk: TextChunk,
    analyzeFunc: (text: string) => Promise<string>
  ): Promise<ChunkResult> {
    const startTime = performance.now()
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= CHUNK_PROCESSING.RETRY_ATTEMPTS; attempt++) {
      try {
        // タイムアウト処理
        const result = await this.withTimeout(
          analyzeFunc(chunk.text),
          CHUNK_PROCESSING.TIMEOUT
        )

        // 結果をパース
        const errors = this.parseAnalysisResult(result, chunk)
        
        return {
          chunkId: chunk.id,
          errors,
          processingTime: performance.now() - startTime,
        }
      } catch (error) {
        lastError = error as Error
        console.warn(`Chunk ${chunk.id} processing failed (attempt ${attempt + 1}):`, error)
        
        if (attempt < CHUNK_PROCESSING.RETRY_ATTEMPTS) {
          await this.delay(CHUNK_PROCESSING.RETRY_DELAY * (attempt + 1))
        }
      }
    }

    // すべてのリトライが失敗した場合
    console.error(`Failed to process chunk ${chunk.id} after ${CHUNK_PROCESSING.RETRY_ATTEMPTS} attempts:`, lastError)
    return {
      chunkId: chunk.id,
      errors: [],
      processingTime: performance.now() - startTime,
    }
  }

  /**
   * AI応答をパース
   */
  private parseAnalysisResult(result: string, chunk: TextChunk): TypoError[] {
    try {
      // JSONとして解析を試みる
      const parsed = JSON.parse(result)
      
      if (!parsed.errors || !Array.isArray(parsed.errors)) {
        return []
      }

      // エラーオブジェクトを検証して返す
      return parsed.errors
        .filter((error: unknown) => {
          const e = error as { type?: string; suggestion?: string }
          return e.type && 
            e.suggestion &&
            ['typo', 'grammar', 'japanese'].includes(e.type)
        })
        .map((error: unknown) => {
          const e = error as { 
            type: string; 
            severity?: string; 
            original?: string; 
            suggestion: string; 
            explanation?: string 
          }
          return {
          type: e.type as 'typo' | 'grammar' | 'japanese',
          severity: e.severity || 'warning',
          original: e.original || '',
          suggestion: e.suggestion,
          explanation: e.explanation || '',
          chunkId: chunk.id,
          position: {
            start: chunk.startIndex,
            end: chunk.endIndex,
          },
        }
        })
    } catch (error) {
      console.error('Failed to parse AI response:', error, 'Response:', result)
      
      // JSON以外の形式で返ってきた場合の簡易パース
      return this.fallbackParse(result, chunk)
    }
  }

  /**
   * フォールバックパーサー（構造化されていない応答用）
   */
  private fallbackParse(result: string, chunk: TextChunk): TypoError[] {
    const errors: TypoError[] = []
    
    // 簡単なパターンマッチングで誤りを検出
    const patterns = [
      /誤字[：:]\s*(.+?)[\s→]/gi,
      /タイポ[：:]\s*(.+?)[\s→]/gi,
      /文法エラー[：:]\s*(.+?)[\s→]/gi,
    ]

    patterns.forEach(pattern => {
      const matches = result.matchAll(pattern)
      for (const match of matches) {
        errors.push({
          type: 'typo',
          severity: 'warning',
          original: match[1] || '',
          suggestion: '修正が必要です',
          explanation: '自動検出されたエラー',
          chunkId: chunk.id,
        })
      }
    })

    return errors
  }

  /**
   * タイムアウト付きPromise
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(ERROR_MESSAGES.TIMEOUT)), timeout)
      ),
    ])
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 処理を中止
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * チャンク結果をマージ
   */
  mergeResults(results: ChunkResult[]): TypoError[] {
    const allErrors: TypoError[] = []
    const seenErrors = new Set<string>()

    for (const result of results) {
      for (const error of result.errors) {
        // 重複を除去（オーバーラップ部分の重複検出を防ぐ）
        const errorKey = `${error.type}:${error.original}:${error.suggestion}`
        if (!seenErrors.has(errorKey)) {
          seenErrors.add(errorKey)
          allErrors.push(error)
        }
      }
    }

    // エラーを重要度でソート
    return allErrors.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 }
      return (severityOrder[a.severity] || 1) - (severityOrder[b.severity] || 1)
    })
  }
}