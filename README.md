# Wails App Launcher

サーバーから配信されるアプリケーションをデスクトップで実行するためのランチャーアプリケーションです。

## 概要

このプロジェクトは、クライアント-サーバー構成のアプリケーション配信システムです。

- **Client** (`client/`): Wails で構築されたデスクトップアプリ。サーバーからアプリケーション一覧を取得し、選択したアプリをダウンロード・実行します。
- **Server** (`server/`): アプリケーションのマニフェストを管理し、リクエストに応じてビルド・配信を行う HTTP API サーバーです。

## 技術スタック

### Client

- **Go** (Wails v2) - デスクトップアプリケーションフレームワーク
- **React** + **TypeScript** - フロントエンド
- **Mantine** - UI コンポーネントライブラリ
- **Vite** - ビルドツール

### Server

- **Go** - HTTP サーバー
- REST API によるアプリケーション一覧・アーティファクト提供

## プロジェクト構成

```
.
├── client/                 # Wails デスクトップアプリ
│   ├── frontend/           # React フロントエンド
│   ├── app.go              # アプリケーションロジック (保存・実行)
│   ├── main.go             # エントリーポイント
│   └── wails.json          # Wails 設定
│
└── server/                 # HTTP API サーバー
    ├── main.go             # サーバーエントリーポイント
    └── server-files/       # アプリケーション配信用リソース
        └── manifest.json   # アプリケーション定義ファイル
```

## 機能

### Client

- サーバーアドレスの設定・保存
- サーバーからアプリケーション一覧を取得
- アプリケーションの詳細表示
- アーティファクト（ZIP / バイナリ）のダウンロードと実行
- クロスプラットフォーム対応（macOS / Windows / Linux）

### Server

- `/api/v1/status` - サーバー状態確認
- `/api/v1/applications` - アプリケーション一覧の取得
- `/api/v1/applications/{name}/artifact` - アーティファクトのビルド・取得

## セットアップ

### 前提条件

- **Go** 1.18 以上
- **Node.js** 16 以上
- **Wails CLI** (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

### Client

```bash
cd client
wails dev
```

### Server

```bash
cd server
go run main.go
```

サーバーは `http://localhost:8080` で起動します。

## ビルド

### Client（本番用ビルド）

```bash
cd client
wails build
```

ビルドされたバイナリは `client/build/bin/` に出力されます。

## マニフェストの設定

`server/server-files/manifest.json` でアプリケーションを定義します。

```json
[
  {
    "name": "App Name",
    "description": "Description of the application",
    "artifact_type": "zip | binary",
    "build_command": "build command to run",
    "artifact_path": "path/to/artifact",
    "run_command": "command to run the app"
  }
]
```

## ライセンス

MIT License
