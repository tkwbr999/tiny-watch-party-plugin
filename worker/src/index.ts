/**
 * アプリケーションエントリーポイント
 * Durable Objects実装: 複数ユーザーWebSocketチャット対応
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// 型定義
import { Bindings } from './types'

// Durable Object
import { ChatRoom } from './ChatRoom'

// サービス層
import { RoomService } from './services/roomService'

// ハンドラー層
import {
  rootHandler,
  healthHandler,
  statusHandler,
  performanceHandler,
  notFoundHandler,
  errorHandler
} from './handlers/health'
import {
  createRoomHandler,
  validateRoomHandler,
  listRoomsHandler,
  roomStatsHandler,
  roomDetailHandler
} from './handlers/rooms'

// ミドルウェア
import {
  securityHeadersMiddleware,
  performanceMiddleware,
  getCorsConfig
} from './middleware/security'

// ユーティリティ
import { ENDPOINTS } from './utils/config'

/**
 * ルーム管理サービス（HTTP API用）
 */
const roomService = new RoomService()

console.log('🚀 [INIT] Durable Objects WebSocket service initialized')

/**
 * アプリケーション初期化
 * Durable Objects WebSocket実装
 */
const createApp = () => {
  const app = new Hono<{ Bindings: Bindings }>()

  console.log('📱 [INIT] Creating app with Durable Objects WebSocket')

  // ============================
  // グローバルミドルウェア
  // ============================
  app.use('*', performanceMiddleware)
  app.use('*', logger())
  app.use('*', cors(getCorsConfig()))
  app.use('*', securityHeadersMiddleware)

  // ============================
  // ルートエンドポイント
  // ============================
  app.get(ENDPOINTS.ROOT, rootHandler)
  
  // ============================
  // ヘルスチェック系エンドポイント
  // ============================
  app.get(ENDPOINTS.HEALTH, healthHandler)
  app.get(ENDPOINTS.STATUS, statusHandler)
  app.get(ENDPOINTS.PERF, performanceHandler)

  // ============================
  // ルーム管理API
  // ============================
  app.post(ENDPOINTS.ROOM_CREATE, (c) => createRoomHandler(c, roomService))
  app.get('/api/rooms/:roomId/validate', (c) => validateRoomHandler(c, roomService))
  app.get(ENDPOINTS.ROOM_LIST, (c) => listRoomsHandler(c, roomService))
  
  // 管理用エンドポイント
  app.get('/api/rooms/stats', (c) => roomStatsHandler(c, roomService))
  app.get('/api/rooms/:roomId/detail', (c) => roomDetailHandler(c, roomService))

  // ============================
  // WebSocketエンドポイント（Durable Objects使用）
  // ============================
  app.get('/ws/:roomId', async (c) => {
    const roomId = c.req.param('roomId')
    console.log(`🔌 [WS] WebSocket request for room: ${roomId}`)

    try {
      // Durable ObjectのIDを取得（ルームIDから）
      const id = c.env.CHAT_ROOMS.idFromName(roomId)
      const chatRoom = c.env.CHAT_ROOMS.get(id)
      
      console.log(`🏠 [WS] Forwarding to Durable Object for room: ${roomId}`)
      
      // Durable ObjectにWebSocketリクエストを転送
      return await chatRoom.fetch(c.req.raw)
    } catch (error) {
      console.error('💥 [WS] Durable Object error:', error)
      return c.json({
        error: 'Durable Object unavailable',
        message: 'Failed to connect to chat room',
        roomId: roomId,
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 500)
    }
  })
  
  console.log('✅ [INIT] WebSocket routing to Durable Objects enabled')

  // ============================
  // エラーハンドリング
  // ============================
  app.notFound(notFoundHandler)
  app.onError(errorHandler)

  return app
}

/**
 * アプリケーションのエクスポート
 * Durable Objects対応
 */
const app = createApp()

export default {
  port: 3000,
  fetch: app.fetch,
}

// Durable Objectのエクスポート
export { ChatRoom }