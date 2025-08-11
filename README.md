# TypoChecker - Chrome拡張機能

Chrome内蔵AI（Gemini Nano）を使用してWebページのタイポ・文法・日本語の問題を検出するChrome拡張機能。

## 機能

- Webページ全体のテキストを抽出（画面外のコンテンツも含む）
- Chrome内蔵AIによるローカル処理
- タイポ、文法エラー、日本語の不自然な表現を検出
- プライバシー保護（すべての処理がローカルで完結）

## 要件

- Chrome 138以降
- Chrome AI APIの有効化
- 22GB以上のディスク空き容量
- 4GB以上のVRAM

## セットアップ

### 1. Chrome AI APIを有効化

1. Chrome Canary、Dev、またはBeta版をインストール
2. `chrome://flags` にアクセス
3. 以下のフラグを有効化:
   - "Prompt API for Gemini Nano" → Enabled
   - "Enables optimization guide on device" → Enabled
4. Chromeを再起動

### 2. 拡張機能のインストール

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build
```

### 3. Chrome拡張機能として読み込む

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist` フォルダを選択

## 開発

```bash
# 自動ビルド（ファイル変更を監視）
npm run dev

# ビルド
npm run build

# コード整形
npm run format
```

開発時は `npm run dev` を実行したまま、chrome://extensions で拡張機能の「↻」ボタンをクリックして更新。

## プロジェクト構造

```
TypoChecker/
├── src/
│   ├── background/    # Service Worker
│   ├── content/       # Content Script
│   ├── popup/         # Popup UI
│   └── shared/        # 共通型定義
├── public/            # 静的ファイル（manifest.json、アイコン）
├── dist/              # ビルド出力
└── docs/              # ドキュメント
```

## 使い方

1. 分析したいWebページを開く
2. 拡張機能アイコンをクリック
3. 「ページをチェック」ボタンをクリック
4. 検出されたエラーを確認
5. 修正提案をコピーして使用

## 注意事項

- Chrome AI APIはまだ実験的な機能です
- 初回使用時にAIモデルのダウンロードが必要です（約1.5-2.4GB）
- 長いページの分析には時間がかかる場合があります

## ライセンス

MIT