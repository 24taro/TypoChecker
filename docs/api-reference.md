# Chrome Built-in AI API リファレンス

## 目次
1. [Prompt API (Language Model API)](#prompt-api-language-model-api)
2. [Summarizer API](#summarizer-api)
3. [Translator API](#translator-api)
4. [Language Detector API](#language-detector-api)
5. [Writer API](#writer-api)
6. [Rewriter API](#rewriter-api)
7. [共通のエラーハンドリング](#共通のエラーハンドリング)

---

## Prompt API (Language Model API)

### 概要
Gemini Nanoモデルに自然言語のプロンプトを送信し、応答を生成するAPIです。

### 基本的な使用方法

#### 1. 利用可能性の確認
```javascript
// APIの利用可能性を確認
const availability = await ai.languageModel.availability();

console.log(availability);
// 返り値:
// 'available' - すぐに使用可能
// 'downloadable' - モデルのダウンロードが必要
// 'unavailable' - 利用不可（システム要件を満たしていない）
```

#### 2. セッションの作成
```javascript
// 基本的なセッション作成
const session = await ai.languageModel.create();

// カスタムパラメータを設定したセッション
const session = await ai.languageModel.create({
  temperature: 0.8,    // 創造性の度合い（0.0〜1.0、デフォルト: 0.8）
  topK: 3,             // 考慮する候補の数（デフォルト: 3）
  systemPrompt: "あなたは親切なアシスタントです。",  // システムプロンプト
});
```

#### 3. プロンプトの送信

##### 単純なプロンプト
```javascript
const response = await session.prompt("JavaScriptで配列をソートする方法を教えてください");
console.log(response);
```

##### ストリーミング応答
```javascript
const stream = session.promptStreaming("長い物語を書いてください");

for await (const chunk of stream) {
  console.log(chunk);  // 部分的な応答を順次表示
}
```

#### 4. マルチモーダル入力（実験的）
```javascript
// マルチモーダルセッションの作成
const session = await ai.languageModel.create({
  expectedInputs: [
    { type: "text" },
    { type: "image" },
    { type: "audio" }
  ]
});

// 画像の分析
const imageBlob = await fetch("/path/to/image.jpg").then(r => r.blob());
const response = await session.prompt([{
  role: "user",
  content: [
    { type: "text", value: "この画像に何が写っていますか？" },
    { type: "image", value: imageBlob }
  ]
}]);

// 音声の文字起こし
const audioBlob = await fetch("/path/to/audio.mp3").then(r => r.blob());
const response = await session.prompt([{
  role: "user",
  content: [
    { type: "text", value: "この音声を文字に起こしてください" },
    { type: "audio", value: audioBlob }
  ]
}]);
```

#### 5. セッション管理

##### トークン使用量の確認
```javascript
console.log(`最大コンテキスト: ${session.maxTokens}`);
console.log(`使用済みトークン: ${session.tokensUsed}`);
console.log(`残りトークン: ${session.tokensRemaining}`);
```

##### セッションのクローン
```javascript
// 現在のコンテキストを保持した新しいセッションを作成
const newSession = await session.clone();
```

##### セッションの破棄
```javascript
session.destroy();
```

### モデルのダウンロード監視
```javascript
const session = await ai.languageModel.create({
  monitor(m) {
    m.addEventListener("downloadprogress", (e) => {
      console.log(`ダウンロード進捗: ${e.loaded * 100}%`);
    });
  }
});
```

---

## Summarizer API

### 概要
テキストを要約するためのAPIです。様々な長さとフォーマットで要約を生成できます。

### 基本的な使用方法

#### 1. 要約器の作成
```javascript
// 基本的な要約器
const summarizer = await ai.summarizer.create();

// カスタムオプション付き要約器
const summarizer = await ai.summarizer.create({
  type: 'bullets',     // 'bullets', 'paragraph', 'sentence'
  length: 'medium',    // 'short', 'medium', 'long'
  format: 'plain-text' // 'plain-text', 'markdown'
});
```

#### 2. テキストの要約
```javascript
const longText = "ここに長い文章を入力...";
const summary = await summarizer.summarize(longText);
console.log(summary);
```

#### 3. ストリーミング要約
```javascript
const stream = await summarizer.summarizeStreaming(longText);

for await (const chunk of stream) {
  console.log(chunk);
}
```

### 要約タイプの例

#### 箇条書き要約
```javascript
const summarizer = await ai.summarizer.create({ type: 'bullets' });
const summary = await summarizer.summarize(article);
// 出力例:
// • 主要ポイント1
// • 主要ポイント2
// • 主要ポイント3
```

#### 段落要約
```javascript
const summarizer = await ai.summarizer.create({ type: 'paragraph' });
const summary = await summarizer.summarize(article);
// 出力例: 記事の内容を簡潔にまとめた段落
```

---

## Translator API

### 概要
テキストを異なる言語間で翻訳するAPIです。

### 基本的な使用方法

#### 1. 翻訳器の作成
```javascript
// 英語から日本語への翻訳器
const translator = await ai.translator.create({
  sourceLanguage: 'en',
  targetLanguage: 'ja'
});
```

#### 2. 利用可能性の確認
```javascript
const availability = await ai.translator.availability({
  sourceLanguage: 'en',
  targetLanguage: 'ja'
});

if (availability === 'available') {
  // 翻訳を実行
}
```

#### 3. テキストの翻訳
```javascript
const translatedText = await translator.translate("Hello, world!");
console.log(translatedText); // "こんにちは、世界！"
```

#### 4. ストリーミング翻訳
```javascript
const stream = await translator.translateStreaming(longText);

for await (const chunk of stream) {
  console.log(chunk);
}
```

### サポート言語の確認
```javascript
// サポートされている言語ペアを確認
const pairs = await ai.translator.getSupportedLanguagePairs();
console.log(pairs);
// 出力例: 
// [
//   { source: 'en', target: 'ja' },
//   { source: 'ja', target: 'en' },
//   ...
// ]
```

---

## Language Detector API

### 概要
テキストの言語を自動検出するAPIです。

### 基本的な使用方法

#### 1. 検出器の作成
```javascript
const detector = await ai.languageDetector.create();
```

#### 2. 言語の検出
```javascript
const results = await detector.detect("これは日本語のテキストです");
console.log(results);
// 出力例:
// [
//   { language: 'ja', confidence: 0.98 },
//   { language: 'zh', confidence: 0.02 }
// ]
```

#### 3. 最も可能性の高い言語を取得
```javascript
const text = "Bonjour le monde";
const results = await detector.detect(text);
const primaryLanguage = results[0].language;
console.log(`検出された言語: ${primaryLanguage}`); // 'fr'
```

### 翻訳APIとの連携
```javascript
// 自動言語検出を使った翻訳
async function autoTranslate(text, targetLanguage) {
  // 言語を検出
  const detector = await ai.languageDetector.create();
  const results = await detector.detect(text);
  const sourceLanguage = results[0].language;
  
  // 翻訳を実行
  const translator = await ai.translator.create({
    sourceLanguage,
    targetLanguage
  });
  
  return await translator.translate(text);
}

const translated = await autoTranslate("Hello", "ja");
console.log(translated); // "こんにちは"
```

---

## Writer API

### 概要
コンテンツ生成をサポートするAPIです（オリジントライアル）。

### 基本的な使用方法

#### 1. ライターの作成
```javascript
const writer = await ai.writer.create({
  tone: 'formal',      // 'formal', 'casual', 'professional'
  length: 'medium',    // 'short', 'medium', 'long'
  format: 'markdown'   // 'plain-text', 'markdown', 'html'
});
```

#### 2. コンテンツの生成
```javascript
// プロンプトからコンテンツを生成
const content = await writer.write(
  "AIの未来について",
  {
    context: "技術ブログ記事として",
    audience: "開発者向け"
  }
);
console.log(content);
```

#### 3. 続きを書く
```javascript
const continuation = await writer.continue(
  existingText,
  { maxLength: 500 }
);
```

---

## Rewriter API

### 概要
既存のテキストを書き換えるAPIです（オリジントライアル）。

### 基本的な使用方法

#### 1. リライターの作成
```javascript
const rewriter = await ai.rewriter.create({
  tone: 'professional',
  clarity: 'high'
});
```

#### 2. テキストの書き換え
```javascript
const originalText = "これはとても難しい文章です。理解するのが大変です。";
const rewritten = await rewriter.rewrite(originalText, {
  goal: 'simplify'  // 'simplify', 'elaborate', 'formalize', 'casual'
});
console.log(rewritten);
```

#### 3. スタイルの変換
```javascript
// カジュアルからフォーマルへ
const formal = await rewriter.rewrite(casualText, {
  goal: 'formalize'
});

// 長い文章を短く
const concise = await rewriter.rewrite(longText, {
  goal: 'shorten',
  maxLength: 100
});
```

---

## 共通のエラーハンドリング

### エラータイプと対処法

#### 1. モデル利用不可
```javascript
try {
  const session = await ai.languageModel.create();
} catch (error) {
  if (error.name === 'NotSupportedError') {
    console.error('このデバイスではAI機能が利用できません');
    // フォールバック処理
  }
}
```

#### 2. モデルダウンロード中
```javascript
const availability = await ai.languageModel.availability();

if (availability === 'downloadable') {
  console.log('モデルをダウンロード中...');
  
  const session = await ai.languageModel.create({
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        updateProgressBar(e.loaded * 100);
      });
    }
  });
}
```

#### 3. トークン制限エラー
```javascript
try {
  const response = await session.prompt(veryLongPrompt);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    console.error('トークン制限を超えました');
    // プロンプトを短くして再試行
  }
}
```

#### 4. セッションタイムアウト
```javascript
let session = await ai.languageModel.create();

// 定期的にセッションを更新
setInterval(async () => {
  if (session.tokensRemaining < 100) {
    session.destroy();
    session = await ai.languageModel.create();
  }
}, 60000);
```

### パフォーマンス最適化のヒント

#### 1. セッションの再利用
```javascript
// ✅ 良い例: セッションを再利用
const session = await ai.languageModel.create();
for (const prompt of prompts) {
  const response = await session.prompt(prompt);
}

// ❌ 悪い例: 毎回新しいセッションを作成
for (const prompt of prompts) {
  const session = await ai.languageModel.create();
  const response = await session.prompt(prompt);
}
```

#### 2. 適切なAPIの選択
```javascript
// タスクに応じた適切なAPIを使用
async function processText(text, task) {
  switch(task) {
    case 'summarize':
      const summarizer = await ai.summarizer.create();
      return await summarizer.summarize(text);
    
    case 'translate':
      const translator = await ai.translator.create({
        sourceLanguage: 'en',
        targetLanguage: 'ja'
      });
      return await translator.translate(text);
    
    default:
      const session = await ai.languageModel.create();
      return await session.prompt(text);
  }
}
```

---

*最終更新日: 2025年8月11日*
*Chrome バージョン: 138 (Beta)*