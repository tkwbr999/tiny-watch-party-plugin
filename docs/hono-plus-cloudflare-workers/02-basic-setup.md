# 基本セットアップ手順

## プロジェクト初期化

### 1. ディレクトリ作成

```bash
mkdir worker
cd worker
```

### 2. npm プロジェクト初期化

```bash
npm init -y
```

### 3. 依存関係インストール

```bash
# 本体
npm install hono

# 開発ツール
npm install -D wrangler @cloudflare/workers-types typescript

# TypeScript設定（オプション）
npm install -D @types/node
```

## 設定ファイル作成

### package.json

```json
{
  "name": "tiny-watch-party-worker",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:prod": "wrangler deploy --env production",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20231218.0",
    "typescript": "^5.3.0",
    "wrangler": "^3.22.0"
  },
  "dependencies": {
    "hono": "^3.12.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["@cloudflare/workers-types"]
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
npx wrangler login
```

### 2. アカウント確認

```bash
npx wrangler whoami
```

## 基本コマンド

```bash
# ローカル開発サーバー起動
npm run dev

# 型チェック
npm run type-check

# デプロイ（開発環境）
npm run deploy

# デプロイ（ステージング）
npm run deploy:staging

# デプロイ（本番）
npm run deploy:prod

# ログ確認
npx wrangler tail

# デプロイ済みWorker一覧
npx wrangler list
```

## トラブルシューティング

### よくあるエラー

1. **wrangler: command not found**
   ```bash
   npx wrangler --version
   ```

2. **認証エラー**
   ```bash
   npx wrangler login
   ```

3. **TypeScriptエラー**
   ```bash
   npm run type-check
   ```

### デバッグ方法

- `console.log()` は Wrangler の開発サーバーで確認可能
- 本番環境では `npx wrangler tail` でリアルタイムログ確認
- Cloudflare Dashboard の Analytics でリクエスト状況を監視