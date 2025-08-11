// AI Model Constants  
export const AI_MODEL = {
  MAX_TEXT_LENGTH: 20000, // 最大テキスト長（約5000トークン）
} as const

// AI Prompt Templates
export const PROMPTS = {
  SYSTEM: `あなたは日本語の文章校正の専門家です。
与えられたテキストから以下を検出してください：
1. タイポ（誤字脱字）
2. 文法エラー
3. 日本語として不自然な表現

重要な指示：
- 必ずJSON形式のみで返答してください
- JSONの前後に説明文や他のテキストを含めないでください
- エラーがない場合は {"errors": []} を返してください
- 返答は { から始まり } で終わる有効なJSONである必要があります`,

  USER_TEMPLATE: (text: string) => `以下のテキストを校正し、JSON形式のみで返答してください。JSONの前後に説明文を含めないでください：

${text}

返答フォーマット（このフォーマットのJSONのみを返してください）：
{
  "errors": [
    {
      "type": "typo" または "grammar" または "japanese",
      "severity": "error" または "warning" または "info",
      "original": "誤っているテキスト",
      "suggestion": "修正案",
      "explanation": "エラーの説明"
    }
  ]
}`,
} as const

