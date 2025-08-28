# ヘルスチェック実装

## 基本実装

### src/index.ts

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

type Bindings = {
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ミドルウェア設定
app.use('*', logger())
app.use('*', cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}))

// ルートエンドポイント
app.get('/', (c) => {
  return c.json({
    service: 'Tiny Watch Party WebSocket Server',
    environment: c.env.ENVIRONMENT || 'unknown',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      status: '/status'
    }
  })
})

// ヘルスチェックエンドポイント
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'tiny-watch-party-worker',
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    uptime: Date.now(),
    version: '1.0.0'
  })
})

// ステータス詳細エンドポイント
app.get('/status', (c) => {
  const headers = Object.fromEntries(c.req.header())
  const url = new URL(c.req.url)
  
  return c.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
    request: {
      method: c.req.method,
      url: url.toString(),
      headers: headers,
      userAgent: c.req.header('User-Agent') || 'unknown'
    },
    worker: {
      region: c.req.cf?.colo || 'unknown',
      country: c.req.cf?.country || 'unknown',
      ip: c.req.header('CF-Connecting-IP') || 'unknown'
    }
  })
})

// 404ハンドラー
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
    timestamp: new Date().toISOString(),
    availableEndpoints: ['/', '/health', '/status']
  }, 404)
})

// エラーハンドラー
app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500)
})

export default app
```

## 型定義

### src/types/index.ts

```typescript
// Cloudflare Workers の環境変数型定義
export interface Env {
  ENVIRONMENT: string
}

// ヘルスチェックレスポンス型
export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  service: string
  environment: string
  timestamp: string
  uptime: number
  version: string
}

// ステータスレスポンス型
export interface StatusResponse {
  status: 'operational' | 'degraded' | 'down'
  timestamp: string
  environment: string
  request: {
    method: string
    url: string
    headers: Record<string, string>
    userAgent: string
  }
  worker: {
    region: string
    country: string
    ip: string
  }
}

// エラーレスポンス型
export interface ErrorResponse {
  error: string
  message: string
  timestamp: string
  availableEndpoints?: string[]
}
```

## テスト用スクリプト

### scripts/test-endpoints.sh

```bash
#!/bin/bash

# 設定
BASE_URL=${1:-"http://localhost:8787"}

echo "Testing endpoints on: $BASE_URL"
echo "=================================="

# ルートエンドポイント
echo "1. Testing root endpoint..."
curl -s "$BASE_URL/" | jq '.'
echo ""

# ヘルスチェック
echo "2. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq '.'
echo ""

# ステータス
echo "3. Testing status endpoint..."
curl -s "$BASE_URL/status" | jq '.'
echo ""

# 404テスト
echo "4. Testing 404 endpoint..."
curl -s "$BASE_URL/nonexistent" | jq '.'
echo ""

echo "All tests completed!"
```

### scripts/test-chrome-extension.js

```javascript
// Chrome拡張機能からのテスト用スクリプト
const API_BASE_URL = 'https://your-worker.your-subdomain.workers.dev'

async function testWorkerEndpoints() {
  try {
    // ヘルスチェック
    const healthResponse = await fetch(`${API_BASE_URL}/health`)
    const healthData = await healthResponse.json()
    console.log('Health check:', healthData)
    
    // ステータス確認
    const statusResponse = await fetch(`${API_BASE_URL}/status`)
    const statusData = await statusResponse.json()
    console.log('Status check:', statusData)
    
    return {
      healthy: healthData.status === 'healthy',
      operational: statusData.status === 'operational'
    }
  } catch (error) {
    console.error('Worker connection failed:', error)
    return { healthy: false, operational: false }
  }
}

// 使用例
testWorkerEndpoints().then(result => {
  if (result.healthy && result.operational) {
    console.log('✅ Worker is ready for WebSocket connections')
  } else {
    console.log('❌ Worker is not ready')
  }
})
```

## 開発・テスト手順

### 1. ローカル開発

```bash
# 開発サーバー起動
npm run dev

# 別ターミナルでテスト実行
chmod +x scripts/test-endpoints.sh
./scripts/test-endpoints.sh http://localhost:8787
```

### 2. デプロイテスト

```bash
# ステージング環境にデプロイ
npm run deploy:staging

# デプロイされたURLでテスト
./scripts/test-endpoints.sh https://tiny-watch-party-worker-staging.your-subdomain.workers.dev
```

### 3. 本番デプロイ

```bash
# 本番環境にデプロイ
npm run deploy:prod

# 本番URLでテスト
./scripts/test-endpoints.sh https://tiny-watch-party-worker-prod.your-subdomain.workers.dev
```

## 監視・ログ確認

### リアルタイムログ

```bash
# 開発環境のログ
npx wrangler tail

# 本番環境のログ
npx wrangler tail --env production
```

### Cloudflare Dashboard

1. Analytics タブで リクエスト数、エラー率を確認
2. Real-time Logs でリアルタイムリクエスト監視
3. Security タブで攻撃・スキャンの検知

## パフォーマンス最適化

### キャッシュヘッダー設定

```typescript
// 静的レスポンスのキャッシュ
app.get('/health', (c) => {
  c.header('Cache-Control', 'public, max-age=30') // 30秒キャッシュ
  return c.json({...})
})
```

### レスポンス圧縮

```typescript
import { compress } from 'hono/compress'

app.use('*', compress())
```

## Chrome拡張機能との統合準備

### CORS設定確認

- Chrome拡張機能のmanifest.jsonでホスト権限設定
- Worker側でchrome-extension://をオリジンに許可
- preflight リクエスト（OPTIONS）の適切な処理

### 次のステップ

ヘルスチェックが正常動作することを確認後、WebSocket実装に進む準備完了。