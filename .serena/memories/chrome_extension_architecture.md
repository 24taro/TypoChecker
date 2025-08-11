# Chrome拡張機能アーキテクチャ - 研究結果

## 重要な技術的制約

### 1. Chrome AI API アクセス制限
- **Content Script**: Chrome AI APIに直接アクセス不可
- **Service Worker**: Chrome AI APIにアクセス可能
- **解決策**: メッセージパッシングによる通信

### 2. Gemini Nano トークン制限
- **制限**: 6,144トークン（約24,576文字）
- **解決策**: CAG (Chunked Augmented Generation) パターン
- **実装**: RecursiveCharacterTextSplitterでチャンク分割

### 3. Manifest V3 要件
- **Background Page廃止**: Service Workerを使用
- **chrome.scripting API**: 動的スクリプト注入
- **CSP強化**: インラインスクリプト禁止

## テキスト抽出戦略

### 可視コンテンツ
```javascript
document.body.innerText  // 表示されているテキスト
```

### 非表示コンテンツ
```javascript
// display:none, visibility:hidden の要素も含む
document.body.textContent

// メタデータ
document.querySelectorAll('meta[content]')

// JSON-LD構造化データ
document.querySelectorAll('script[type="application/ld+json"]')
```

### 完全なDOM取得
```javascript
// XPath使用
document.evaluate("//text()", document, null, XPathResult.ANY_TYPE, null)
```

## メッセージパッシングパターン

### Content Script → Service Worker
```javascript
chrome.runtime.sendMessage({
  type: 'EXTRACT_TEXT',
  data: extractedContent
})
```

### Service Worker → Content Script
```javascript
chrome.tabs.sendMessage(tabId, {
  type: 'ANALYSIS_RESULT',
  data: results
})
```

## パフォーマンス最適化

1. **バッチ処理**: 3-5チャンクを並列処理
2. **キャッシュ**: chrome.storage.localで30分間結果保存
3. **プログレッシブレンダリング**: 結果を順次表示
4. **メモリ管理**: 大きなテキストは処理後即座に解放

## セキュリティ考慮事項

1. **CSP準拠**: eval()使用禁止、インラインスクリプト禁止
2. **権限最小化**: activeTabのみ使用
3. **データプライバシー**: ローカル処理のみ
4. **XSS対策**: DOM操作時のサニタイズ