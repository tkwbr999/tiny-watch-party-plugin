/**
 * WebSocket関連の型定義
 */

// WebSocketメッセージの基本インターフェース
export interface ClientMessage {
  type: 'ping' | 'join_room' | 'leave_room' | 'send_message'
  timestamp: number
  data?: any
}

export interface ServerMessage {
  type: 'pong' | 'room_joined' | 'room_left' | 'message' | 'error' | 'user_joined' | 'user_left'
  timestamp: number
  data?: any
}

// ユーザー情報
export interface UserInfo {
  id: string
  username?: string
  joinedAt: number
}

// WebSocketコネクション管理
export interface RoomConnection {
  roomId: string
  websocket: WebSocket
  userInfo: UserInfo
  connectedAt: number
}

// WebSocketハンドラー設定
export interface WebSocketHandler {
  onMessage: (event: any, ws: WebSocket) => void | Promise<void>
  onOpen?: (event: any, ws: WebSocket) => void | Promise<void>
  onClose?: (event: any, ws: WebSocket) => void | Promise<void>
  onError?: (event: any, ws: WebSocket) => void | Promise<void>
}

// メッセージデータの型定義
export interface JoinRoomData {
  userId: string
  username?: string
}

export interface SendMessageData {
  message: string
  userId: string
  username?: string
}

export interface RoomJoinedData {
  roomId: string
  participantCount: number
  yourUserId: string
}

export interface UserJoinedData {
  userId: string
  username?: string
}

export interface UserLeftData {
  userId: string
  username?: string
}

export interface MessageData {
  message: string
  userId: string
  username: string
}

// WebSocketのreadyState定数
export const WEBSOCKET_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
} as const

export const WebSocket = {
  READY_STATE_OPEN: 1,
  READY_STATE_CLOSED: 3
} as any