# TypoChecker Chrome拡張機能 要件定義

## 機能要件
1. **ページ全体のコンテンツ取得**
   - 表示中のタブの全コンテンツを読み込む
   - 画面上に表示されていない部分も含めて全て取得

2. **AI解析**
   - 取得したコンテンツをChrome内蔵AI（Gemini Nano）に送信
   - タイポ、文法エラー、日本語的におかしい箇所を検出

3. **結果表示**
   - 検出されたエラーをChrome拡張のポップアップ画面に一覧表示
   - エラーの詳細情報と修正提案を提供

## 技術仕様
- TypeScript + Biome
- Chrome Manifest V3
- Chrome Built-in AI API
- ローカル処理によるプライバシー保護

## 処理フロー
1. ユーザーが「ページをチェック」ボタンをクリック
2. Content Scriptがページ全体のテキストを抽出
3. Background Service WorkerでAI解析
4. ポップアップUIに結果を表示