import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { generateRoomId, generateHostToken, validateRoomId, RuntimeDetector } from './utils/room'

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
  return c.json({
    service: 'Tiny Watch Party WebSocket Server',
    runtime: RuntimeDetector.current,
    environment: c.env?.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      status: '/status',
      perf: '/perf',
      roomCreate: '/api/rooms/create',
      roomValidate: '/api/rooms/{roomId}/validate'
    },
    performance: {
      note: RuntimeDetector.getPerformanceNote()
    }
  })
})

// ヘルスチェック with パフォーマンス情報
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'tiny-watch-party-worker',
    runtime: RuntimeDetector.current,
    environment: c.env?.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    uptime: Date.now(),
    version: '1.0.0',
    features: {
      webSocket: 'planned',
      honoFramework: '✅',
      typeScript: '✅',
      cors: '✅',
      performance: '✅',
      roomManagement: '✅'
    }
  })
})

// ステータス詳細エンドポイント
app.get('/status', (c) => {
  const url = new URL(c.req.url)
  
  return c.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    runtime: RuntimeDetector.current,
    environment: c.env?.ENVIRONMENT || 'development',
    request: {
      method: c.req.method,
      url: url.toString(),
      userAgent: c.req.header('User-Agent') || 'unknown'
    },
    worker: {
      region: (c.req as any).cf?.colo || 'local',
      country: (c.req as any).cf?.country || 'local',
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'localhost'
    },
    performance: {
      runtime: RuntimeDetector.current,
      note: RuntimeDetector.getPerformanceNote()
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
  
  return c.json({
    runtime: RuntimeDetector.current,
    processingTime: `${end - start}ms`,
    dataProcessed: {
      total: data.length,
      filtered: processed.length
    },
    timestamp: new Date().toISOString()
  })
})

// ルーム作成API
app.post('/api/rooms/create', async (c) => {
  const roomId = generateRoomId()
  const hostToken = generateHostToken()
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + 3 * 60 * 60 * 1000) // 3時間後
  
  // レスポンスヘッダー設定
  c.header('X-Room-Id', roomId)
  c.header('X-Host-Token', hostToken)
  
  const host = c.req.header('host') || 'localhost:3000'
  const protocol = host.includes('localhost') ? 'ws://' : 'wss://'
  
  return c.json({
    roomId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    hostToken,
    websocketUrl: `${protocol}${host}/ws/${roomId}`,
    shareUrl: `https://tiny-watch-party.example.com/join/${roomId}`,
    management: {
      validateUrl: `/api/rooms/${roomId}/validate`,
      maxParticipants: 10,
      autoExpire: true
    }
  }, 201)
})

// ルーム情報取得・バリデーション
app.get('/api/rooms/:roomId/validate', (c) => {
  const roomId = c.req.param('roomId')
  const isValid = validateRoomId(roomId)
  
  return c.json({
    roomId,
    valid: isValid,
    message: isValid ? 'Valid room ID format' : 'Invalid room ID format',
    format: 'XXXX-YYYY-ZZZZ (12 characters, A-Z and 0-9)',
    example: 'A3F2-8K9L-4MN7'
  })
})

// ルーム一覧（デモ用）
app.get('/api/rooms', (c) => {
  // 実際の実装ではデータベースから取得
  const demoRooms = [
    {
      roomId: generateRoomId(),
      status: 'active',
      participants: Math.floor(Math.random() * 5) + 1,
      createdAt: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      roomId: generateRoomId(),
      status: 'active', 
      participants: Math.floor(Math.random() * 3) + 1,
      createdAt: new Date(Date.now() - Math.random() * 3600000).toISOString()
    }
  ]
  
  return c.json({
    rooms: demoRooms,
    total: demoRooms.length,
    note: 'This is demo data. Real implementation would use database.'
  })
})

// 404ハンドラー
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
    timestamp: new Date().toISOString(),
    availableEndpoints: ['/', '/health', '/status', '/perf', 'POST /api/rooms/create', '/api/rooms', '/api/rooms/{roomId}/validate']
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