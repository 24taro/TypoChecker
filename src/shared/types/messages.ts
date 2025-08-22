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

export interface ModelDownloadStartMessage {
  type: 'MODEL_DOWNLOAD_START'
  data: {
    message: string
  }
}

export interface ModelDownloadProgressMessage {
  type: 'MODEL_DOWNLOAD_PROGRESS'
  data: {
    status: 'downloading'
    message: string
    progress?: number
  }
}

export interface ModelDownloadCompleteMessage {
  type: 'MODEL_DOWNLOAD_COMPLETE'
  data: {
    message: string
    success: boolean
  }
}

export interface ModelDownloadErrorMessage {
  type: 'MODEL_DOWNLOAD_ERROR'
  data: {
    message: string
    error: string
  }
}

export interface InitiateModelDownloadMessage {
  type: 'INITIATE_MODEL_DOWNLOAD'
}

export interface StartStreamingAnalysisMessage {
  type: 'START_STREAMING_ANALYSIS'
  tabId: number
}

export interface AnalysisStreamStartMessage {
  type: 'ANALYSIS_STREAM_START'
  data: {
    message: string
  }
}

export interface AnalysisStreamChunkMessage {
  type: 'ANALYSIS_STREAM_CHUNK'
  data: {
    chunk: string
    progress?: number
  }
}

export interface AnalysisStreamEndMessage {
  type: 'ANALYSIS_STREAM_END'
  data: {
    finalResults: AnalysisResult
    stats: AnalysisStats
  }
}

export interface AnalysisStreamErrorMessage {
  type: 'ANALYSIS_STREAM_ERROR'
  data: {
    message: string
    error: string
  }
}

export type Message =
  | ExtractTextMessage
  | AnalysisCompleteMessage
  | StartAnalysisMessage
  | ProgressUpdateMessage
  | PageContentMessage
  | ModelDownloadStartMessage
  | ModelDownloadProgressMessage
  | ModelDownloadCompleteMessage
  | ModelDownloadErrorMessage
  | InitiateModelDownloadMessage
  | StartStreamingAnalysisMessage
  | AnalysisStreamStartMessage
  | AnalysisStreamChunkMessage
  | AnalysisStreamEndMessage
  | AnalysisStreamErrorMessage