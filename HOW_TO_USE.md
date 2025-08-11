# 使い方

## セットアップ（初回のみ）

```bash
# 1. 依存関係インストール
npm install

# 2. ビルド
npm run build
```

## Chrome拡張機能として読み込む

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist` フォルダを選択

## 開発

```bash
# 自動ビルド起動（別ターミナルで実行したままにする）
npm run dev
```

コードを編集したら、chrome://extensions で拡張機能の「↻」ボタンをクリックして更新。

## コマンド一覧

```bash
npm run dev     # 自動ビルド（開発用）
npm run build   # ビルド
npm run format  # コード整形
npm run lint    # リントチェック
```