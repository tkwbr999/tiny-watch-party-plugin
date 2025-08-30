# ドキュメント案内 (Tiny Watch Party)

- 目的: 小規模コミュニティ向けウォッチパーティ機能のサーバ/拡張の設計・実装・運用メモを集約
- 実装: Cloudflare Workers + Durable Objects、Hono、TypeScript、Bun
- 対象: 開発者（サーバ／拡張機能）、運用担当、寄稿者

## 構成マップ
- 概要と全体像: `docs/spec.md`
- WebSocket 詳細: `docs/websocket/`
  - 00-overview.md（概要）
  - 01-web-socket-spec.md（仕様）
  - 02-security-guidelines.md（セキュリティ）
  - 03-platform-comparison.md（比較）
  - 04-platform-setup.md（プラットフォーム設定）
  - 05-use-case-implementation.md（ユースケース/実装）
- Cloudflare Workers + Hono: `docs/hono-plus-cloudflare-workers/`
  - 00-overview.md（概要）
  - 01-technology-research.md（技術調査）
  - 02-basic-setup.md（セットアップ）
  - 03-health-check-implementation.md（ヘルスチェック）
  - 04-websocket-preparation.md（WS準備）

## はじめに（Quick Start）
- ローカル開発:
  1) `cd worker`
  2) 依存関係インストール: `bun install`
  3) 開発起動: `bun run index.ts` または `bun run dev`（設定に応じて）
  4) テスト: `bun test`
- Cloudflare Workers での実行: `worker/wrangler.toml` を参照。`wrangler dev` でローカル、`wrangler deploy` で本番。

詳細は `worker/README.md` と `docs/hono-plus-cloudflare-workers/` を参照してください。

## API エンドポイント
- 健康確認: `GET /health`
- ステータス: `GET /status`
- パフォーマンス: `GET /perf`
- ルーム作成: `POST /api/rooms/create`
- ルーム検証: `GET /api/rooms/:roomId/validate`
- ルーム一覧(デモ): `GET /api/rooms`
- WebSocket: `GET /ws/:roomId`

コードの定義元: `worker/src/utils/config.ts (ENDPOINTS)`

## WebSocket 仕様の読み方
- まず `docs/websocket/00-overview.md` → `01-web-socket-spec.md` を順に読むと全体像が掴めます。
- 実装やチューニングは `05-use-case-implementation.md` を参照。
- セキュリティは `02-security-guidelines.md` に集約。

## 変更の指針（軽量）
- 1トピック=1ファイル、重複する説明は既存の章にリンクで集約。
- 見出し階層は H1=1つ（タイトル）、H2〜H3で統一。
- 図や長大なサンプルは別ファイル化し、本文は要点と参照リンクを記述。
- 追加時は本ファイル（docs/README.md）の「構成マップ」に追記。

## トラブルシュート
- ローカル通知（macOS）: `afplay /System/Library/Sounds/Glass.aiff`
- ポート競合時: `worker/wrangler.toml` と `CONFIG.SERVER` の確認
- WebSocket が繋がらない: ルームID形式とネットワーク／CORS を確認

---
この案内は参照ハブです。詳細は各ドキュメントの該当章を参照してください。
