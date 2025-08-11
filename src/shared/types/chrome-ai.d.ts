// Chrome 138+ Built-in AI API型定義
declare global {
  // グローバルLanguageModelオブジェクト（Chrome 138+）
  const LanguageModel: {
    availability(): Promise<'unavailable' | 'available' | 'downloading'>
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
  }

  interface LanguageModelCreateOptions {
    systemPrompt?: string
    temperature?: number
    topK?: number
  }

  interface LanguageModelSession {
    prompt(input: string): Promise<string>
    promptStreaming(input: string): AsyncIterable<string>
    destroy(): void
    tokensSoFar?: number
    maxTokens?: number
    tokensLeft?: number
    countPromptTokens?(prompt: string): Promise<number>
  }
}

export type AIAvailability = 'no' | 'readily' | 'after-download'

export interface AIError {
  code: 'NOT_AVAILABLE' | 'DOWNLOAD_REQUIRED' | 'SESSION_FAILED' | 'PROMPT_FAILED'
  message: string
}

export interface AIAnalysisResult {
  errors: Array<{
    type: 'typo' | 'grammar' | 'japanese'
    severity: 'error' | 'warning' | 'info'
    original: string
    suggestion?: string
    explanation?: string
    context?: string
    position?: {
      start: number
      end: number
    }
  }>
  processedChunks?: number
  totalChunks?: number
}