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
}

export interface AnalysisCompleteMessage {
  type: 'ANALYSIS_COMPLETE'
  data: {
    results: AnalysisResult[]
    stats: AnalysisStats
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