// AI Model Constants
export const AI_MODEL = {
  MAX_TEXT_LENGTH: 20000, // 最大テキスト長（約5000トークン）
} as const;

// AI Prompt Templates
export const PROMPTS = {
  SYSTEM: `
# あなたの役割
あなたは日本語の文章校正の専門家です。

# 検出対象
- 誤字脱字（タイポ）
- 文法エラー
- 日本語として不自然な表現

# 重要な指示
- 与えられたテキストから上記のエラーを正確に検出してください
- 必ずJSON形式のみで返答してください
- JSONの前後に説明文や他のテキストを含めないでください
- エラーがない場合は {"errors": []} を返してください
- 返答は { から始まり } で終わる有効なJSONである必要があります
`,

  USER_TEMPLATE: (
    text: string
  ) => `以下のテキストから誤字脱字、文法エラー、不自然な日本語表現を検出してください。
必ずJSON形式のみで返答してください：

${text}

返答フォーマット（このフォーマットのJSONのみを返してください）：
{
  "errors": [
    {
      "type": "typo",
      "severity": "error",
      "original": "誤っている実際のテキスト",
      "suggestion": "修正案",
      "explanation": "エラーの簡潔な説明"
    }
  ]
}`,
} as const;
