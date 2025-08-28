import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// Bun開発環境とCloudflare Workers両対応の型定義
type Bindings = {
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Bindings }>()

// パフォーマンス測定ミドルウェア
app.use('*', async (c, next) => {
  const start = performance.now()
  await next()
  const end = performance.now()
  c.header('X-Response-Time', `${end - start}ms`)
})

app.use('*', logger())
app.use('*', cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}))

// ルートエンドポイント
app.get('/', (c) => {
  const runtime = typeof Bun !== 'undefined' ? 'bun' : 'cloudflare-workers'
  return c.json({
    service: 'Tiny Watch Party WebSocket Server',
    runtime,
    environment: c.env?.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      status: '/status'
    },
    performance: {
      note: runtime === 'bun' ? 'Running on Bun - Ultra Fast!' : 'Running on Cloudflare Workers - Edge Optimized!'
    }
  })
})

// ヘルスチェック with パフォーマンス情報
app.get('/health', (c) => {
  const runtime = typeof Bun !== 'undefined' ? 'bun' : 'cloudflare-workers'
  return c.json({
    status: 'healthy',
    service: 'tiny-watch-party-worker',
    runtime,
    environment: c.env?.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    uptime: Date.now(),
    version: '1.0.0',
    features: {
      webSocket: 'planned',
      honoFramework: '✅',
      typeScript: '✅',
      cors: '✅',
      performance: '✅'
    }
  })
})

// ステータス詳細エンドポイント
app.get('/status', (c) => {
  const headers = Object.fromEntries(c.req.header())
  const url = new URL(c.req.url)
  const runtime = typeof Bun !== 'undefined' ? 'bun' : 'cloudflare-workers'
  
  return c.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    runtime,
    environment: c.env?.ENVIRONMENT || 'development',
    request: {
      method: c.req.method,
      url: url.toString(),
      headers: headers,
      userAgent: c.req.header('User-Agent') || 'unknown'
    },
    worker: {
      region: c.req.cf?.colo || 'local',
      country: c.req.cf?.country || 'local',
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'localhost'
    },
    performance: {
      runtime,
      note: runtime === 'bun' ? 'Local development with hot reload' : 'Edge deployment with global distribution'
    }
  })
})

// パフォーマンステストエンドポイント
app.get('/perf', async (c) => {
  const start = performance.now()
  
  // 軽量な処理でパフォーマンステスト
  const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() }))
  const processed = data.filter(item => item.value > 0.5).map(item => ({ ...item, processed: true }))
  
  const end = performance.now()
  const runtime = typeof Bun !== 'undefined' ? 'bun' : 'cloudflare-workers'
  
  return c.json({
    runtime,
    processingTime: `${end - start}ms`,
    dataProcessed: {
      total: data.length,
      filtered: processed.length
    },
    timestamp: new Date().toISOString()
  })
})

// 404ハンドラー
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
    timestamp: new Date().toISOString(),
    availableEndpoints: ['/', '/health', '/status', '/perf']
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

// Bun開発サーバー用とCloudflare Workers用のエクスポート
export default {
  port: 3000,
  fetch: app.fetch,
}