# Repository Guidelines

## Project Structure & Module Organization
- Root: Chrome 拡張のメタとスクリプト（`package.json`、`Makefile`）。
- `extension/`: コンテンツスクリプトと拡張定義（`content.js`、`background.js`、`manifest.json`）。
- `worker/`: Cloudflare Workers（Hono + Durable Objects）サーバー。`src/` に API/WS 実装、`tests/` にユニット/統合テスト。
- `docs/`: 仕様・ユースケース・設計の資料（`docs/README.md` が入口）。
- `scripts/`: 便利 CLI と検証用スクリプト。

## Build, Test, and Development Commands
- 拡張パッケージ（root）
  - `make pack` / `make dev-pack`: 拡張のパッケージ作成（開発/通常）。
  - `npm run build` / `npm run build:dev`: 上記 Make 呼び出し。
- サーバ（worker）
  - `cd worker && bun test`: すべてのテスト実行。
  - `cd worker && bun run dev`: ローカル実行（Bun）。
  - `cd worker && npx wrangler dev`: Workers ローカル開発。
  - `cd worker && npx wrangler deploy`: 本番デプロイ。

## Coding Style & Naming Conventions
- 言語: TypeScript（worker）、JavaScript（extension）。インデントはスペース 2。
- 変数/関数: `camelCase`、クラス/型: `PascalCase`。
- 拡張 UI は Shadow DOM を優先し、グローバル CSS 汚染を避ける。
- 自動整形ツールの固定はなし（現状）。既存スタイルに合わせること。

## Testing Guidelines
- フレームワーク: `bun:test`。
- 配置: `worker/tests/unit/*`（ユニット）、`worker/tests/*integration*`・`*websocket*`（統合）。
- 実行: `cd worker && bun test`。必要に応じて `bun test tests/unit/` で範囲指定。
- 追加テストは隣接する `*.test.ts` とし、分かりやすいケース名を付与。

## Commit & Pull Request Guidelines
- コミットメッセージは Conventional Commits を推奨:
  - 例: `feat(extension): フルスクリーンのカウントダウン導入`
  - 例: `fix(worker): ルームID検証のエラーハンドリング修正`
- PR には目的、変更点、テスト結果（スクショ/ログ）を簡潔に記載。関連 issue をリンク。

## Security & Configuration Tips
- Cloudflare Workers の設定は `worker/wrangler.toml`。環境変数は `worker/.env.example` を参照し、`DEV_BASE_URL` を必ず設定。
- WebSocket エンドポイントは `worker/src/index.ts` と `extension/content.js` の整合を保つ。

