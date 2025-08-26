export interface ExtractTextMessage {
  type: 'EXTRACT_TEXT'
  data: {
    url: string
    content: ExtractedContent
  }
}

export interface ExtractedContent {
  visibleText: string[]
  hiddenText: string[]
  metadata: string[]
  structuredData?: unknown[]
  totalLength?: number
}

export interface AnalysisCompleteMessage {
  type: 'ANALYSIS_COMPLETE'
  data: {
    errors?: TypoError[]
    results?: AnalysisResult[]
    stats?: AnalysisStats
    url?: string
    tokenInfo?: unknown
  }
}

export interface AnalysisResult {
  errors: TypoError[]
  tokensUsed?: number
}

export interface TypoError {
  type: 'typo' | 'grammar' | 'japanese'
  severity: 'error' | 'warning' | 'info'
  original?: string
  text?: string
  suggestion: string
  explanation?: string
  chunkId?: number
  position?: {
    start: number
    end: number
  }
}

export interface AnalysisStats {
  totalErrors: number
  typoCount: number
  grammarCount: number
  japaneseCount: number
}

export interface StartAnalysisMessage {
  type: 'START_ANALYSIS'
  tabId: number
}

export interface ProgressUpdateMessage {
  type: 'PROGRESS_UPDATE'
  data: {
    current: number
    total: number
    phase: 'extracting' | 'analyzing' | 'complete'
  }
}

export interface PageContentMessage {
  type: 'PAGE_CONTENT'
  data: {
    url: string
    title: string
    content: ExtractedContent
  }
}

export type Message =
  | ExtractTextMessage
  | AnalysisCompleteMessage
  | StartAnalysisMessage
  | ProgressUpdateMessage
  | PageContentMessage