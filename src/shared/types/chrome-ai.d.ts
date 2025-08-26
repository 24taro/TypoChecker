// Chrome 138+ Built-in AI API型定義（最新仕様）
declare global {
  // グローバルLanguageModelオブジェクト（Chrome 138+）
  const LanguageModel: {
    availability(): Promise<'unavailable' | 'available' | 'downloading' | 'downloadable'>
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
  }

  interface LanguageModelCreateOptions {
    initialPrompts?: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>
    temperature?: number
    topK?: number
  }

  interface LanguageModelSession {
    prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>
    promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>
    destroy(): void
    inputUsage: number
    inputQuota: number
    countPromptTokens?(prompt: string): Promise<number>
  }
}

export type AIAvailability = 'no' | 'readily' | 'after-download' | 'downloadable'

export interface AIError {
  code: 'NOT_AVAILABLE' | 'DOWNLOAD_REQUIRED' | 'SESSION_FAILED' | 'PROMPT_FAILED'
  message: string
}

export interface AIAnalysisResult {
  errors: Array<{
    type: 'typo' | 'grammar' | 'japanese'
    severity: 'error' | 'warning' | 'info'
    original: string
    suggestion: string
    context?: string
    position?: {
      start: number
      end: number
    }
  }>
  processedChunks: number
  totalChunks: number
}

export interface ModelDownloadProgress {
  status: 'starting' | 'downloading' | 'complete' | 'error'
  message: string
  progress?: number
}

export interface ModelDownloadResult {
  success: boolean
  message: string
  error?: string
}