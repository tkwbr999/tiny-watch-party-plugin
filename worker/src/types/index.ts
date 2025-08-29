/**
 * 型定義の統一エクスポート
 */

// WebSocket関連型
export * from './websocket'

// API関連型
export * from './api'

// utils/room.tsからの型も再エクスポート
export { 
  SecurityErrorCode, 
  RoomCreateResponse,
  RoomValidationResult 
} from '../utils/room'

// 共通型定義
export type RuntimeEnvironment = 'bun' | 'cloudflare-workers'

export interface AppConfig {
  environment: string
  runtime: RuntimeEnvironment
  features: {
    webSocket: boolean
    cors: boolean
    rateLimiting: boolean
    inputValidation: boolean
    htmlSanitization: boolean
  }
}

// Honoフレームワーク用の型ヘルパー
export type HonoContext<T = {}> = {
  env?: T
  req: {
    url: string
    method: string
    param: (key: string) => string
    header: (name: string) => string | undefined
  }
  header: (name: string, value: string) => void
  json: (object: any, status?: number) => Response
}

// メッセージ検証結果
export interface MessageValidationResult {
  valid: boolean
  error?: string
}

// セキュリティ関連
export interface SecurityConfig {
  rateLimitEnabled: boolean
  inputValidationEnabled: boolean
  htmlSanitizationEnabled: boolean
  maxMessageLength: number
  maxUsernameLength: number
  rateLimits: {
    messagesPerMinute: number
    connectionsPerMinute: number
    windowMs: number
  }
}