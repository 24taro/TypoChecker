// Google AI Studio (Gemini API) 型定義

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[]
  generationConfig?: GeminiGenerationConfig
  safetySettings?: GeminiSafetySetting[]
  systemInstruction?: GeminiContent
}

export interface GeminiContent {
  role: 'user' | 'model' | 'system'
  parts: GeminiPart[]
}

export interface GeminiPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
}

export interface GeminiGenerationConfig {
  temperature?: number
  topP?: number
  topK?: number
  candidateCount?: number
  maxOutputTokens?: number
  stopSequences?: string[]
}

export interface GeminiSafetySetting {
  category: string
  threshold: string
}

export interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
  modelVersion?: string
}

export interface GeminiCandidate {
  content: GeminiContent
  finishReason?: string
  index: number
  safetyRatings?: GeminiSafetyRating[]
}

export interface GeminiSafetyRating {
  category: string
  probability: string
  probabilityScore?: number
  severity?: string
  severityScore?: number
}

export interface GeminiError {
  error: {
    code: number
    message: string
    status: string
    details?: unknown[]
  }
}