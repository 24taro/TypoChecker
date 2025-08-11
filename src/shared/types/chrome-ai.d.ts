declare global {
  namespace chrome.ai {
    interface LanguageModel {
      capabilities(): Promise<LanguageModelCapabilities>
      create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
    }

    interface LanguageModelCapabilities {
      available: 'no' | 'readily' | 'after-download'
      defaultTemperature?: number
      defaultTopK?: number
      maxTopK?: number
    }

    interface LanguageModelCreateOptions {
      systemPrompt?: string
      temperature?: number
      topK?: number
    }

    interface LanguageModelSession {
      prompt(input: string): Promise<string>
      promptStreaming?(input: string): ReadableStream<string>
      destroy(): void
      tokensSoFar?: number
      maxTokens?: number
      tokensLeft?: number
      countPromptTokens?(prompt: string): Promise<number>
    }

    const languageModel: LanguageModel
  }
}

interface Window {
  ai?: {
    languageModel?: chrome.ai.LanguageModel
  }
}

declare const self: {
  ai?: {
    languageModel?: chrome.ai.LanguageModel
  }
} & ServiceWorkerGlobalScope

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