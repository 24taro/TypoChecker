# Chrome AI デバッグガイド

## エラー「AIセッションの作成に失敗しました」の対処法

### 1. Chrome AIが利用可能か確認

Chrome AI (Gemini Nano) を使用するには以下が必要です：

1. **Chrome 138以降**
   - chrome://settings/help で確認

2. **Chrome AI フラグを有効化**
   ```
   chrome://flags/#built-in-ai-api
   ```
   を「Enabled」に設定

3. **Gemini Nano のダウンロード**
   ```
   chrome://flags/#gemini-nano-api
   ```
   を「Enabled」に設定（必要に応じて）

### 2. デバッグ手順

1. **Service Worker Console** を開く：
   - `chrome://extensions`
   - TypoChecker拡張機能の「詳細」
   - 「Service Worker」をクリック
   - Consoleタブを確認

2. **確認すべきログ**：
   ```
   Checking availability for provider: chrome-ai
   LanguageModel type: object
   Chrome AI availability result: available
   Initializing Chrome AI (Gemini Nano)...
   Creating Chrome AI session with config: {...}
   Chrome AI session created successfully: {...}
   ```

3. **よくあるエラー**：
   - `LanguageModel is undefined` → フラグが有効でない
   - `availability: unavailable` → モデルがダウンロードされていない
   - セッション作成エラー → Chrome版が古い

### 3. 代替手段

Chrome AIが利用できない場合：
1. 拡張機能の設定を開く
2. 「Gemini 2.5 Flash API」を選択
3. [API Key取得](https://aistudio.google.com/apikey)
4. API Keyを入力・保存

### 4. 確認コマンド

Service Worker Console で実行：
```javascript
console.log('LanguageModel available:', typeof LanguageModel !== 'undefined');
if (typeof LanguageModel !== 'undefined') {
  LanguageModel.availability().then(a => console.log('Availability:', a));
}
```