# ログ確認ガイド - プロンプトと出力結果の確認方法

## Service Workerのログを確認する方法

### 1. Service Workerのデベロッパーツールを開く

1. **Chrome拡張機能管理ページ**を開く
   - `chrome://extensions` にアクセス
   - または、Chrome メニュー → その他のツール → 拡張機能

2. **TypoChecker拡張機能**を見つける

3. **「Service Worker」リンク**をクリック
   - 拡張機能カードの「詳細」セクションにある
   - クリックすると新しいDevToolsウィンドウが開く

### 2. Consoleタブでログを確認

DevToolsが開いたら、**Console**タブを選択します。

## 確認できるログの種類

### 📤 送信プロンプト（AI PROMPT）
```
=== AI PROMPT START ===
📤 Sending prompt to Gemini Nano:
以下のテキストを校正してください：

[実際のページテキスト]

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
}
=== AI PROMPT END ===
```

### 📥 AIレスポンス（AI RESPONSE）
```
=== AI RESPONSE START ===
📥 Response from Gemini Nano:
{
  "errors": [
    {
      "type": "typo",
      "severity": "error",
      "original": "これわ",
      "suggestion": "これは",
      "explanation": "助詞の誤り"
    }
  ]
}
=== AI RESPONSE END ===
```

### 📋 パース処理（PARSING）
```
=== PARSING ANALYSIS RESULT ===
📋 Raw response to parse: [生のレスポンステキスト]
🔍 Found JSON: [抽出されたJSON]
✅ Parsed result: [パース後のオブジェクト]
```

## チャンク処理のログ

複数のチャンクに分割された場合：
```
Split text into 3 chunks
```

## エラーログの確認

エラーが発生した場合：
```
❌ Failed to parse AI response: [エラー詳細]
❌ No JSON found in response: [レスポンス内容]
```

## フィルタリング機能

Consoleの検索ボックスを使用して特定のログを絞り込み：

- `AI PROMPT` - 送信したプロンプトのみ表示
- `AI RESPONSE` - AIからの応答のみ表示
- `PARSING` - パース処理のみ表示
- `🧪` - テストモード関連（テストモード有効時）

## ログレベルの設定

DevToolsのConsoleで以下のフィルタを使用：
- **Verbose**: すべてのログを表示
- **Info**: 通常のログのみ
- **Warnings**: 警告のみ
- **Errors**: エラーのみ

## ログのエクスポート

1. Consoleで右クリック
2. 「Save as...」を選択
3. ログをテキストファイルとして保存

## トラブルシューティング

### ログが表示されない場合
1. 拡張機能を再読み込み（chrome://extensions で ↻ ボタン）
2. Service Workerを再起動（DevToolsを閉じて再度開く）
3. ページを再読み込みして「ページをチェック」を再実行

### ログが多すぎる場合
- Console右上の「Clear console」（🚫）でクリア
- フィルタ機能を使用して必要なログのみ表示