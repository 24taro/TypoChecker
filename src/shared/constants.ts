// Gemini Nano Model Constants
export const AI_MODEL = {
  MAX_TOKENS: 6144,
  // 日本語は1文字約2-3トークンとして計算
  CHARS_PER_TOKEN: 4,
  MAX_CHARS_PER_CHUNK: 20000, // 約5000トークン（安全マージン込み）
  OVERLAP_CHARS: 500, // チャンク間のオーバーラップ
} as const

// Text Extraction Constants
export const EXTRACTION = {
  MIN_TEXT_LENGTH: 10, // 最小テキスト長
  MAX_META_LENGTH: 500, // メタデータの最大長
  IGNORED_TAGS: ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET'],
  BLOCK_ELEMENTS: ['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH'],
} as const

// AI Prompt Templates
export const PROMPTS = {
  SYSTEM: `あなたは日本語の文章校正の専門家です。
与えられたテキストから以下を検出してJSON形式で返してください：
1. タイポ（誤字脱字）
2. 文法エラー
3. 日本語として不自然な表現

重要な指示：
- 必ず有効なJSON形式で返答してください
- エラーがない場合は空の配列を返してください
- 各エラーには種類、重要度、元のテキスト、修正案、説明を含めてください`,

  USER_TEMPLATE: (text: string) => `以下のテキストを校正してください：

${text}

以下のJSON形式で返答してください：
{
  "errors": [
    {
      "type": "typo" | "grammar" | "japanese",
      "severity": "error" | "warning" | "info",
      "original": "誤っているテキスト",
      "suggestion": "修正案",
      "explanation": "エラーの説明"
    }
  ]
}`,
} as const

// Chunk Processing Constants
export const CHUNK_PROCESSING = {
  BATCH_SIZE: 3, // 同時処理するチャンク数
  RETRY_ATTEMPTS: 2, // リトライ回数
  RETRY_DELAY: 1000, // リトライ待機時間（ミリ秒）
  TIMEOUT: 30000, // タイムアウト時間（ミリ秒）
} as const

// Error Messages
export const ERROR_MESSAGES = {
  NO_CONTENT: 'ページにテキストコンテンツが見つかりません',
  CHUNK_FAILED: 'チャンクの処理に失敗しました',
  PARSE_ERROR: 'AI応答の解析に失敗しました',
  TIMEOUT: '処理がタイムアウトしました',
  MODEL_NOT_READY: 'AIモデルの準備ができていません',
} as const