# 基本セットアップ手順

## プロジェクト初期化

### 1. ディレクトリ作成

```bash
mkdir worker
cd worker
```

### 2. Bun プロジェクト初期化

```bash
bun init -y
```

### 3. 依存関係インストール

```bash
# 本体
bun add hono

# 開発ツール
bun add -d wrangler @cloudflare/workers-types

# BunはネイティブでTypeScriptをサポート（追加パッケージ不要）
```

## 設定ファイル作成

### package.json

```json
{
  "name": "tiny-watch-party-worker",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "dev:wrangler": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:prod": "wrangler deploy --env production",
    "type-check": "bun run tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20231218.0",
    "wrangler": "^3.22.0"
  },
  "dependencies": {
    "hono": "^3.12.0"
  }
}
```

### tsconfig.json (Bun最適化版)

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "strict": true,
    "downlevelIteration": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "types": [
      "bun-types",
      "@cloudflare/workers-types"
    ]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### wrangler.toml

```toml
#:schema node_modules/wrangler/config-schema.json
name = "tiny-watch-party-worker"
main = "src/index.ts"
compatibility_date = "2024-12-28"
compatibility_flags = ["nodejs_compat"]

# 開発環境用変数
[vars]
ENVIRONMENT = "development"

# ステージング環境
[env.staging]
name = "tiny-watch-party-worker-staging"
vars = { ENVIRONMENT = "staging" }

# 本番環境
[env.production]
name = "tiny-watch-party-worker-prod"
vars = { ENVIRONMENT = "production" }
```

## プロジェクト構造

```
worker/
├── src/
│   ├── index.ts          # メインエントリーポイント
│   ├── handlers/         # ルートハンドラー
│   └── types/            # 型定義
├── package.json
├── tsconfig.json
├── wrangler.toml
├── .gitignore
├── .dev.vars             # ローカル開発用環境変数
└── README.md
```

## .gitignore

```gitignore
node_modules/
bun.lockb
dist/
.wrangler/
.dev.vars*
.env*
*.log
.DS_Store
```

## 環境変数設定

### .dev.vars（ローカル開発用）

```env
# ローカル開発用の設定
API_BASE_URL=http://localhost:8787
DEBUG=true
```

### .dev.vars.staging

```env
# ステージング環境用
API_BASE_URL=https://tiny-watch-party-worker-staging.your-subdomain.workers.dev
DEBUG=true
```

### .dev.vars.production

```env
# 本番環境用
API_BASE_URL=https://tiny-watch-party-worker-prod.your-subdomain.workers.dev
DEBUG=false
```

## Cloudflare認証設定

### 1. Wranglerログイン

```bash
bunx wrangler login
```

### 2. アカウント確認

```bash
bunx wrangler whoami
```

## 基本コマンド

```bash
# Bunローカル開発サーバー起動（ホットリロード）
bun run dev

# Wranglerローカル開発サーバー起動
bun run dev:wrangler

# 型チェック
bun run type-check

# テスト実行
bun test

# デプロイ（開発環境）
bun run deploy

# デプロイ（ステージング）
bun run deploy:staging

# デプロイ（本番）
bun run deploy:prod

# ログ確認
bunx wrangler tail

# デプロイ済みWorker一覧
bunx wrangler list
```

## トラブルシューティング

### よくあるエラー

1. **wrangler: command not found**
   ```bash
   bunx wrangler --version
   ```

2. **認証エラー**
   ```bash
   bunx wrangler login
   ```

3. **TypeScriptエラー**
   ```bash
   bun run type-check
   ```

### デバッグ方法

- `console.log()` は Bun または Wrangler の開発サーバーで確認可能
- 本番環境では `bunx wrangler tail` でリアルタイムログ確認
- Cloudflare Dashboard の Analytics でリクエスト状況を監視
- Bunの高速リロード機能により開発効率が大幅に向上