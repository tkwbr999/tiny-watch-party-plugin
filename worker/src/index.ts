/**
 * アプリケーションエントリーポイント
 * リファクタリング後: 責任分離と依存性注入による構造化
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// 型定義
import { Bindings } from './types'

// サービス層
import { RoomService } from './services/roomService'
import { MessageService } from './services/messageService'
import { ConnectionService } from './services/connectionService'

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
import {
  createWebSocketHandler,
  developmentWebSocketHandler
} from './handlers/websocket'

// ミドルウェア
import {
  securityHeadersMiddleware,
  performanceMiddleware,
  getCorsConfig
} from './middleware/security'

// ユーティリティ
import { RuntimeDetector } from './utils/room'
import { ENDPOINTS } from './utils/config'

// 🔒 型安全な WebSocket インポート（既存ロジック維持）
type UpgradeWebSocketFn = (handler: (c: any) => any) => any

let upgradeWebSocket: UpgradeWebSocketFn | undefined
if (RuntimeDetector.isCloudflareWorkers()) {
  try {
    upgradeWebSocket = require('hono/cloudflare-workers').upgradeWebSocket as UpgradeWebSocketFn
  } catch (error) {
    console.error('Failed to load Cloudflare Workers WebSocket module:', error)
  }
}

/**
 * アプリケーション初期化
 */
const createApp = () => {
  const app = new Hono<{ Bindings: Bindings }>()

  // ============================
  // 依存性注入によるサービス初期化
  // ============================
  const roomService = new RoomService()
  const messageService = new MessageService()
  const connectionService = new ConnectionService(roomService)

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
  // WebSocketエンドポイント
  // ============================
  if (RuntimeDetector.isCloudflareWorkers() && upgradeWebSocket) {
    // Cloudflare Workers環境
    const wsHandler = createWebSocketHandler(roomService, messageService, connectionService)
    app.get('/ws/:roomId', upgradeWebSocket(wsHandler))
  } else {
    // Bun開発環境では代替エンドポイント
    app.get('/ws/:roomId', developmentWebSocketHandler)
  }

  // ============================
  // エラーハンドリング
  // ============================
  app.notFound(notFoundHandler)
  app.onError(errorHandler)

  return app
}

/**
 * アプリケーションのエクスポート
 * Bun開発サーバー用とCloudflare Workers用の両方に対応
 */
const app = createApp()

export default {
  port: 3000,
  fetch: app.fetch,
}