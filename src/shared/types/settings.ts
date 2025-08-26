export type AIProvider = 'gemini-api' | 'chrome-nano'
export type GeminiModel = 'gemini-2.5-pro' | 'gemini-2.5-flash'
export type ContentLevel = 'text-only' | 'html-only' | 'html-css' | 'html-css-js'

export interface AISettings {
  provider: AIProvider
  geminiApiKey?: string
  geminiModel: GeminiModel
  fallbackToChromeNano: boolean
  contentLevel: ContentLevel
}

export interface StoredSettings {
  aiSettings: AISettings
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'chrome-nano', // より安全なデフォルトとしてChrome Nanoを使用
  geminiModel: 'gemini-2.5-flash',
  fallbackToChromeNano: true, // フォールバックを有効化
  contentLevel: 'html-css',
}

export const GEMINI_MODELS = {
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    description: '最高品質の推論と複雑なタスクに最適、思考機能付き',
    maxTokens: 1048576,
    costLevel: 'high',
  },
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    description: '高速で効率的、価格とパフォーマンスのバランス',
    maxTokens: 1048576,
    costLevel: 'low',
  },
} as const

export const CONTENT_LEVELS = {
  'text-only': {
    name: 'テキストのみ',
    description: 'ページのテキストコンテンツのみを抽出',
    size: '最小',
  },
  'html-only': {
    name: 'HTMLのみ',
    description: 'HTML構造を含む（CSS・JavaScriptは除外）',
    size: '小',
  },
  'html-css': {
    name: 'HTML + CSS',
    description: 'HTML構造とスタイル情報を含む（推奨）',
    size: '中',
  },
  'html-css-js': {
    name: 'HTML + CSS + JavaScript',
    description: '全ての情報を含む（最大サイズ）',
    size: '大',
  },
} as const

export const AI_PROVIDERS = {
  'gemini-api': {
    name: 'Google Gemini API',
    description: 'Google AI Studio APIキーを使用',
    requiresApiKey: true,
    supportsLargeContent: true,
  },
  'chrome-nano': {
    name: 'Chrome Built-in AI (Nano)',
    description: 'Chrome内蔵のローカルAI',
    requiresApiKey: false,
    supportsLargeContent: false,
  },
} as const
