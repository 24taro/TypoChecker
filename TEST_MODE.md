# テストモード動作確認ガイド

## 概要
Chrome AI APIが利用できない環境でも、ダミーデータを使用して拡張機能の動作を確認できるテストモードを実装しました。

## テストモードの有効化/無効化

### 有効化（デフォルト）
`src/shared/constants.ts` の `TEST_MODE.ENABLED` を `true` に設定:
```typescript
export const TEST_MODE = {
  ENABLED: true,  // ← true でテストモード有効
  DELAY_MS: 1000,
} as const
```

### 無効化（実際のAI使用）
```typescript
export const TEST_MODE = {
  ENABLED: false,  // ← false で実際のChrome AI APIを使用
  DELAY_MS: 1000,
} as const
```

## 動作確認手順

### 1. 拡張機能のビルドと読み込み
```bash
# ビルド
npm run build

# Chrome拡張機能として読み込む
1. Chrome で chrome://extensions を開く
2. 「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」
4. dist フォルダを選択
```

### 2. テスト実行
1. 任意のWebページを開く
2. 拡張機能のアイコンをクリック
3. 「ページをチェック」ボタンをクリック
4. 分析が実行され、ダミーエラーが表示される

## テストモードで表示されるダミーエラー

### タイポ（誤字）エラー
- **エラー例1**: 「これわ間違った文章です」→「これは間違った文章です」
  - 助詞「は」が「わ」になっています
- **エラー例2**: 「プログラミングを勉強してまいす」→「プログラミングを勉強しています」
  - 「います」が「まいす」になっています

### 文法エラー
- **エラー例1**: 「昨日は学校に行きませんでしたでした」→「昨日は学校に行きませんでした」
  - 「でした」が重複しています
- **エラー例2**: 「明日は会議がありますですので」→「明日は会議がありますので」
  - 「ます」と「です」が重複しています

### 日本語表現エラー
- **エラー例**: 「私は食べるをしました」→「私は食事をしました」
  - 日本語として不自然な表現です

## コンソールログの確認

テストモード動作時は、以下のようなログが表示されます：

```
🧪 Test mode enabled - returning mock availability
🧪 Test mode - creating mock session
🧪 Test mode - returning mock errors for text: [処理中のテキストの冒頭]...
```

### デベロッパーツールでの確認方法
1. 拡張機能管理ページ（chrome://extensions）を開く
2. TypoChecker の「Service Worker」をクリック
3. Consoleタブでログを確認

## トラブルシューティング

### エラーが表示されない場合
1. テストモードが有効になっているか確認
2. ビルドが正しく完了しているか確認
3. 拡張機能を再読み込み（chrome://extensions で「↻」ボタン）

### 実際のChrome AI APIを使用したい場合
1. `TEST_MODE.ENABLED` を `false` に設定
2. Chrome 138以降を使用
3. Chrome AI フラグを有効化（chrome://flags）
4. 十分なディスク容量（22GB以上）を確保

## 注意事項
- テストモードではランダムに1〜3個のダミーエラーが表示されます
- 実際の文章内容に関係なく、同じダミーエラーが表示されます
- 本番環境では必ず `TEST_MODE.ENABLED` を `false` に設定してください