/**
 * WebSocket ハンドラー
 */

import { ClientMessage, ServerMessage, WebSocketHandler } from '../types'
import { RoomService } from '../services/roomService'
import { MessageService } from '../services/messageService'
import { ConnectionService } from '../services/connectionService'
import { 
  connectionRateLimitMiddleware, 
  messageRateLimitCheck, 
  validateWebSocketMessageSize 
} from '../middleware/security'
import { validateRoomIdParam } from '../middleware/validation'
import { SecurityErrorCode } from '../utils/room'
import { getClientIP } from '../utils/helpers'
import { CONFIG, ERROR_MESSAGES } from '../utils/config'

/**
 * WebSocketハンドラーファクトリー
 * 依存性を注入してWebSocketハンドラーを生成
 */
export const createWebSocketHandler = (
  roomService: RoomService,
  messageService: MessageService,
  connectionService: ConnectionService
) => {
  return (c: any): WebSocketHandler | Response => {
    // ルームIDの検証
    const roomIdValidation = validateRoomIdParam(c)
    if (!roomIdValidation.valid) {
      return createWebSocketErrorResponse(roomIdValidation.error)
    }

    const roomId = roomIdValidation.roomId!

    // 接続レート制限チェック
    const rateLimitCheck = connectionRateLimitMiddleware(c)
    if (rateLimitCheck.rateLimited) {
      return createWebSocketErrorResponse(rateLimitCheck.errorResponse!, rateLimitCheck.statusCode)
    }

    // WebSocketハンドラーを返す
    return {
      onOpen: (event: any, ws: WebSocket) => {
        console.log(`WebSocket connected to room: ${roomId}`)
      },

      onMessage: async (event: any, ws: WebSocket) => {
        try {
          await handleWebSocketMessage(
            event,
            ws,
            roomId,
            roomService,
            messageService,
            connectionService
          )
        } catch (error) {
          console.error('WebSocket message handling error:', error)
          connectionService.handleWebSocketError(roomId, ws, error)
        }
      },

      onClose: (event: any, ws: WebSocket) => {
        connectionService.handleWebSocketClose(roomId, ws, event)
      },

      onError: (event: any, ws: WebSocket) => {
        connectionService.handleWebSocketError(roomId, ws, event)
      }
    }
  }
}

/**
 * WebSocketメッセージ処理の中核ロジック
 */
const handleWebSocketMessage = async (
  event: any,
  ws: WebSocket,
  roomId: string,
  roomService: RoomService,
  messageService: MessageService,
  connectionService: ConnectionService
): Promise<void> => {
  // メッセージサイズ検証
  const sizeValidation = validateWebSocketMessageSize(event.data as string)
  if (!sizeValidation.valid) {
    connectionService.sendMessage(ws, sizeValidation.error!)
    return
  }

  // JSON解析
  let clientMessage: ClientMessage
  try {
    clientMessage = JSON.parse(event.data as string)
  } catch (error) {
    const errorMessage = messageService.handleParseError(error as Error)
    connectionService.sendMessage(ws, errorMessage)
    return
  }

  // メッセージ構造の検証
  const messageValidation = messageService.validateClientMessage(clientMessage)
  if (!messageValidation.valid) {
    const errorMessage = messageService.createErrorMessage(
      SecurityErrorCode.INVALID_MESSAGE,
      messageValidation.error || 'Invalid message'
    )
    connectionService.sendMessage(ws, errorMessage)
    return
  }

  // レート制限チェック（メッセージ送信）
  const clientIP = getClientIP((event as any).request?.headers || {})
  const rateLimitCheck = messageRateLimitCheck(clientIP)
  if (rateLimitCheck.rateLimited) {
    connectionService.sendMessage(ws, rateLimitCheck.error!)
    return
  }

  // メッセージタイプ別処理
  await processClientMessage(clientMessage, ws, roomId, roomService, messageService, connectionService)
}

/**
 * クライアントメッセージのタイプ別処理
 */
const processClientMessage = async (
  message: ClientMessage,
  ws: WebSocket,
  roomId: string,
  roomService: RoomService,
  messageService: MessageService,
  connectionService: ConnectionService
): Promise<void> => {
  switch (message.type) {
    case 'ping':
      await handlePing(ws, messageService, connectionService)
      break

    case 'join_room':
      await handleJoinRoom(message, ws, roomId, roomService, messageService, connectionService)
      break

    case 'send_message':
      await handleSendMessage(message, ws, roomId, roomService, messageService, connectionService)
      break

    case 'leave_room':
      await handleLeaveRoom(ws, roomId, roomService, messageService, connectionService)
      break

    default:
      const errorMessage = messageService.createErrorMessage(
        SecurityErrorCode.INVALID_MESSAGE,
        `Unknown message type: ${message.type}`
      )
      connectionService.sendMessage(ws, errorMessage)
  }
}

/**
 * ping メッセージの処理
 */
const handlePing = async (
  ws: WebSocket,
  messageService: MessageService,
  connectionService: ConnectionService
): Promise<void> => {
  const pongMessage = messageService.createPongResponse()
  connectionService.sendMessage(ws, pongMessage)
}

/**
 * ルーム参加メッセージの処理
 */
const handleJoinRoom = async (
  message: ClientMessage,
  ws: WebSocket,
  roomId: string,
  roomService: RoomService,
  messageService: MessageService,
  connectionService: ConnectionService
): Promise<void> => {
  const processResult = messageService.processJoinRoomMessage(message.data)
  
  if (!processResult.valid || !processResult.userInfo) {
    const errorMessage = messageService.createErrorMessage(
      SecurityErrorCode.INVALID_MESSAGE,
      processResult.error || 'Invalid join_room data'
    )
    connectionService.sendMessage(ws, errorMessage)
    return
  }

  const userInfo = processResult.userInfo
  const joinResult = roomService.joinRoom(roomId, ws, userInfo)

  if (!joinResult.success) {
    const errorMessage = messageService.createErrorMessage(
      SecurityErrorCode.INVALID_MESSAGE,
      'Room is full or join failed'
    )
    connectionService.sendMessage(ws, errorMessage)
    return
  }

  // 他のユーザーに参加通知
  connectionService.notifyUserJoined(roomId, userInfo, ws)

  // 参加者に成功通知
  const joinedMessage = messageService.createRoomJoinedMessage(
    roomId,
    joinResult.participantCount,
    userInfo.id
  )
  connectionService.sendMessage(ws, joinedMessage)
}

/**
 * メッセージ送信の処理
 */
const handleSendMessage = async (
  message: ClientMessage,
  ws: WebSocket,
  roomId: string,
  roomService: RoomService,
  messageService: MessageService,
  connectionService: ConnectionService
): Promise<void> => {
  const processResult = messageService.processSendMessageMessage(message.data)
  
  if (!processResult.valid) {
    const errorMessage = messageService.createErrorMessage(
      SecurityErrorCode.INVALID_MESSAGE,
      processResult.error || 'Invalid send_message data'
    )
    connectionService.sendMessage(ws, errorMessage)
    return
  }

  // メッセージをルーム内にブロードキャスト
  const sentCount = connectionService.broadcastChatMessage(
    roomId,
    processResult.message!,
    processResult.userId!,
    processResult.username!
  )

  console.log(`Message broadcasted to ${sentCount} users in room ${roomId}`)
}

/**
 * ルーム退出メッセージの処理
 */
const handleLeaveRoom = async (
  ws: WebSocket,
  roomId: string,
  roomService: RoomService,
  messageService: MessageService,
  connectionService: ConnectionService
): Promise<void> => {
  connectionService.cleanupConnection(roomId, ws)

  const leftMessage = messageService.createRoomLeftMessage(roomId)
  connectionService.sendMessage(ws, leftMessage)
}

/**
 * WebSocket接続エラー時のレスポンス作成
 */
const createWebSocketErrorResponse = (error: any, statusCode: number = 400): Response => {
  return new Response(JSON.stringify(error), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

/**
 * 開発環境用のWebSocket代替ハンドラー
 */
export const developmentWebSocketHandler = (c: any): Response => {
  return c.json({
    error: ERROR_MESSAGES.WEBSOCKET_NOT_SUPPORTED,
    message: 'WebSocket functionality is only available in Cloudflare Workers environment',
    roomId: c.req.param('roomId'),
    alternatives: {
      production: 'Deploy to Cloudflare Workers to test WebSocket functionality',
      testing: 'Use curl/fetch to test HTTP APIs instead'
    }
  }, 501)
}