# TypoChecker - Chrome拡張機能 完全仕様書

## 1. プロジェクト概要

### 1.1 プロジェクトの目的
Chrome内蔵AI（Gemini Nano）を活用して、Webページ全体のタイポ・文法・日本語の問題を検出するChrome拡張機能。プライバシーを保護しながらローカルでAI処理を実行する。

### 1.2 主要機能
- Webページ全体のテキスト抽出（画面外のコンテンツも含む）
- Chrome内蔵AIによるローカル処理
- タイポ、文法エラー、日本語の不自然な表現を検出
- プライバシー保護（すべての処理がローカルで完結）
- リアルタイムでの結果表示とフィルタリング
- 修正案のコピー機能

### 1.3 技術要件
- Chrome 138以降
- Chrome AI APIの有効化（chrome://flags）
- 22GB以上のディスク空き容量
- 4GB以上のVRAM（初回使用時にAIモデルダウンロードが必要）

### 1.4 技術スタック
- **フロントエンド**: TypeScript, HTML5, CSS3
- **ビルドツール**: Vite 5.3.5
- **コード品質**: Biome 1.8.3（フォーマッター、リンター）
- **Chrome拡張**: Manifest V3
- **AI**: Chrome Built-in Language Model API（Gemini Nano）

## 2. アーキテクチャ設計

### 2.1 コンポーネント構成
```
┌─────────────────────────────────────────────────────────────┐
│                        Web Page (DOM)                        │
└─────────────────────────────────────────────────────────────┘
                               ↑
                    [1. DOM Access & Text Extraction]
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                      Content Script                          │
│  - DOM traversal & text extraction                          │
│  - Hidden content detection                                 │
│  - Text chunking preparation                                │
└─────────────────────────────────────────────────────────────┘
                               ↓
                    [2. Message Passing (chrome.runtime)]
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                  Service Worker (Background)                 │
│  - Chrome AI API access                                     │
│  - Chunk processing orchestration                           │
│  - Session management                                       │
└─────────────────────────────────────────────────────────────┘
                               ↓
                    [3. AI Processing (Gemini Nano)]
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                        Popup UI                              │
│  - Results display                                          │
│  - User interaction                                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 データフロー
1. ユーザーがPopup UIで「ページをチェック」をクリック
2. Background ScriptがContent Scriptにページテキスト抽出を指示
3. Content Scriptがページ全体のテキストを抽出
4. Background ScriptがテキストをAIで解析
5. 結果を集約してPopup UIに表示

### 2.3 プロジェクト構造
```
TypoChecker/
├── src/
│   ├── background/
│   │   ├── index.ts              # Service Worker エントリーポイント
│   │   └── ai-session.ts         # Chrome AI API セッション管理
│   │
│   ├── content/
│   │   └── index.ts              # Content Script エントリーポイント
│   │
│   ├── popup/
│   │   ├── index.html            # ポップアップUI
│   │   ├── index.ts              # UIロジック
│   │   └── styles.css            # スタイルシート
│   │
│   └── shared/
│       └── types/
│           ├── chrome-ai.d.ts    # Chrome AI API型定義
│           └── messages.ts       # メッセージ型定義
│
├── public/
│   ├── manifest.json             # Chrome拡張マニフェスト
│   └── icons/                    # アイコンファイル
│
├── docs/                         # 技術文書
│   ├── technical-architecture.md
│   ├── api-reference.md
│   ├── gemini-nano-overview.md
│   └── implementation-guide.md
│
├── package.json                  # 依存関係
├── tsconfig.json                # TypeScript設定
├── biome.json                   # Biome設定
├── vite.config.ts               # Viteビルド設定
└── HOW_TO_USE.md                # 使用方法
```

## 3. 実装詳細

### 3.1 Chrome拡張機能設定（Manifest V3）

**manifest.json の主要設定：**
- Manifest V3準拠
- Chrome 138以降対応
- 必要最小限の権限（storage, activeTab, scripting, tabs）
- すべてのURLへのアクセス権（<all_urls>）
- Service Workerベースの背景処理
- Content Security Policyによるセキュリティ強化

### 3.2 Content Script実装（src/content/index.ts）

**主要機能：**
- DOM TreeWalkerによるテキスト抽出
- 可視・非表示テキストの分離
- メタデータ収集（meta タグ、alt属性）
- スクリプト・スタイルタグの除外

**抽出データ構造：**
```typescript
interface ExtractedContent {
  visibleText: string[]      // 可視テキスト配列
  hiddenText: string[]       // 非表示テキスト配列  
  metadata: string[]         // メタデータ配列
}
```

### 3.3 Background Script実装（src/background/）

#### 3.3.1 メイン処理（index.ts）
- メッセージハンドリング（AI可用性チェック、解析開始、コンテンツ処理）
- Content Scriptとの連携
- Popup UIへの結果送信
- エラーハンドリング

#### 3.3.2 AI Session Manager（ai-session.ts）
**主要機能：**
- Chrome AI APIの可用性確認
- LanguageModelセッションの初期化と管理
- テキスト解析処理
- JSON形式の結果パース
- トークン使用状況の監視

**システムプロンプト設計：**
```
あなたは日本語の文章校正アシスタントです。
与えられたテキストから以下を検出してください：
1. タイポ（誤字）
2. 文法エラー
3. 日本語として不自然な表現

結果は以下のJSON形式で返してください：
{
  "errors": [
    {
      "type": "typo" | "grammar" | "japanese",
      "severity": "error" | "warning" | "info",
      "original": "元のテキスト",
      "suggestion": "修正案",
      "context": "周辺のテキスト（オプション）"
    }
  ]
}
```

### 3.4 Popup UI実装（src/popup/）

#### 3.4.1 HTML構造（index.html）
- ヘッダー（タイトル、ステータスインジケータ）
- 解析セクション（実行ボタン、プログレスバー）
- サマリーセクション（エラー統計）
- エラーセクション（フィルタタブ、エラーリスト）
- フッター（エクスポート、設定ボタン）

#### 3.4.2 UI ロジック（index.ts）
**主要クラス： PopupUI**
- イベントリスナー設定
- メッセージリスナー設定
- 解析開始処理
- 結果表示とフィルタリング
- エラーハンドリング
- AI可用性チェック

#### 3.4.3 スタイル設計（styles.css）
- サイズ：450px × 600px（最大高さ）
- カラースキーム：
  - エラー: #dc3545（赤）
  - 警告: #ffc107（黄）
  - 情報: #17a2b8（青）
  - 成功: #28a745（緑）
- レスポンシブ設計とスクロール対応

### 3.5 型定義システム（src/shared/types/）

#### 3.5.1 Chrome AI API型定義（chrome-ai.d.ts）
```typescript
declare global {
  const LanguageModel: {
    availability(): Promise<'unavailable' | 'available' | 'downloading'>
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
  }
  
  interface LanguageModelSession {
    prompt(input: string): Promise<string>
    promptStreaming(input: string): AsyncIterable<string>
    destroy(): void
    tokensSoFar?: number
    maxTokens?: number
    tokensLeft?: number
  }
}
```

#### 3.5.2 メッセージ型定義（messages.ts）
- ExtractTextMessage: テキスト抽出結果
- AnalysisCompleteMessage: 解析完了通知
- StartAnalysisMessage: 解析開始指示
- ProgressUpdateMessage: 進捗更新
- PageContentMessage: ページコンテンツ

### 3.6 ビルド設定

#### 3.6.1 Vite設定（vite.config.ts）
- マルチエントリーポイント（background, content, popup）
- ファイル構成の最適化
- 静的ファイルの自動コピー
- Chrome拡張機能向けの出力設定

#### 3.6.2 TypeScript設定（tsconfig.json）
- ES2022ターゲット
- ESNextモジュール
- 厳密型チェック有効
- Chrome/Node型定義
- パスエイリアス設定（@/*, @shared/*）

#### 3.6.3 Biome設定（biome.json）
- 自動インポート整理
- 推奨ルール有効
- カスタムフォーマットルール
- セミコロンとクォートの統一

## 4. Chrome AI API統合

### 4.1 API可用性確認フロー
1. LanguageModelオブジェクトの存在確認
2. availability()メソッドによる状態チェック
3. 状態に応じた処理分岐：
   - 'available': 即座に使用可能
   - 'downloading': ダウンロード待機
   - 'unavailable': エラー処理

### 4.2 セッション管理
- 初期化フラグによる重複防止
- システムプロンプトの設定
- 温度パラメータ（0.2）で一貫性重視
- トークン使用状況の監視

### 4.3 エラーハンドリング
```typescript
enum ErrorType {
  NOT_AVAILABLE = 'Chrome AI APIが利用できません',
  DOWNLOAD_REQUIRED = 'AIモデルのダウンロードが必要です',
  SESSION_FAILED = 'AIセッションの作成に失敗しました',
  PROMPT_FAILED = 'テキスト分析に失敗しました'
}
```

## 5. 開発・運用情報

### 5.1 セットアップ手順
```bash
# 1. 依存関係インストール
npm install

# 2. ビルド
npm run build

# 3. Chrome拡張機能として読み込む
# chrome://extensions → デベロッパーモード ON → dist フォルダを選択
```

### 5.2 開発コマンド
```bash
npm run dev      # 自動ビルド（開発用）
npm run build    # プロダクションビルド
npm run format   # コード整形
npm run lint     # リントチェック
```

### 5.3 Chrome AI APIセットアップ
1. Chrome Canary、Dev、またはBeta版をインストール
2. chrome://flags にアクセス
3. 以下のフラグを有効化：
   - "Prompt API for Gemini Nano" → Enabled
   - "Enables optimization guide on device" → Enabled
4. Chromeを再起動

### 5.4 デバッグ方法
- Background Script: chrome://extensions → サービスワーカー → 検証
- Content Script: 開発者ツール → Console
- Popup: 拡張機能アイコンを右クリック → 「ポップアップを検証」

## 6. パフォーマンス考慮事項

### 6.1 制約事項
- **Gemini Nanoトークン制限**: 6,144トークン（約24,576文字）
- **処理時間**: 長いページでは分析に時間がかかる
- **メモリ使用量**: AIモデル実行時の高メモリ消費

### 6.2 最適化戦略
- テキスト分割による並列処理（将来実装予定）
- 結果キャッシュによる再実行の高速化（将来実装予定）
- 非同期処理によるUI応答性の確保

## 7. セキュリティ・プライバシー

### 7.1 データ保護
- すべての処理がローカルで実行
- 外部サーバーへのデータ送信なし
- 機密情報の自動検出とマスキング（将来実装予定）

### 7.2 Content Security Policy
- インラインスクリプトの禁止
- 外部リソースの制限
- eval()の使用禁止

### 7.3 権限の最小化
- 必要最小限の権限のみ要求
- activeTabで現在のタブのみアクセス

## 8. 今後の拡張計画

### Phase 1 (現在実装済み)
- 基本的なタイポ検出
- シンプルなUI
- 日本語サポート
- Chrome AI API統合

### Phase 2 (計画中)
- テキストチャンク分割処理（CAGパターン）
- 並列処理によるパフォーマンス向上
- 結果キャッシュシステム
- 多言語サポート

### Phase 3 (将来構想)
- カスタムルールの設定
- 修正の自動適用
- 統計ダッシュボード
- チーム共有機能

## 9. 既知の問題と制限事項

### 9.1 技術制限
- Chrome 138以降必須
- 初回ダウンロード時間（1.5-2.4GB）
- AIモデルのローカル制約

### 9.2 機能制限
- 現在は単一チャンク処理（Phase 2で改善予定）
- エクスポート機能未実装
- 設定画面未実装

## 10. メンテナンス情報

### 10.1 依存関係管理
- 定期的な依存関係アップデート
- Chrome API変更への追従
- セキュリティアップデートの適用

### 10.2 モニタリング
- エラーログの収集
- パフォーマンスメトリクス
- ユーザーフィードバックの収集

---

**作成日**: 2025年8月22日  
**最終更新**: プロジェクト全実装確認後の包括的仕様書作成  
**バージョン**: 1.0.0