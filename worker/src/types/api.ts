/**
 * HTTP API関連の型定義
 */

import { SecurityErrorCode } from '../utils/room'

// リクエスト/レスポンス基本型
export interface Bindings {
  ENVIRONMENT: string
}

export interface ApiContext {
  env?: Bindings
  req: {
    url: string
    method: string
    param: (key: string) => string
    header: (name: string) => string | undefined
  }
  header: (name: string, value: string) => void
  json: (object: any, status?: number) => Response
}

// エラーレスポンス
export interface ErrorResponse {
  type: 'error'
  code: SecurityErrorCode
  message: string
  timestamp: number
  context?: Record<string, any>
}

export interface StandardErrorResponse {
  error: string
  message: string
  timestamp: string
  availableEndpoints?: string[]
}

// ヘルスチェック関連
export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  service: string
  runtime: string
  environment: string
  timestamp: string
  uptime: number
  version: string
  features: Record<string, string>
  limitations?: Record<string, string>
}

export interface StatusResponse {
  status: 'operational' | 'degraded' | 'outage'
  timestamp: string
  runtime: string
  environment: string
  request: {
    method: string
    url: string
    userAgent: string
  }
  worker: {
    region: string
    country: string
    ip: string
  }
  performance: {
    runtime: string
    note: string
  }
}

export interface PerformanceResponse {
  runtime: string
  processingTime: string
  dataProcessed: {
    total: number
    filtered: number
  }
  timestamp: string
}

// ルーム管理API
export interface RoomCreateRequest {
  // リクエストボディは現在空だが、将来的に設定を追加可能
}

export interface RoomCreateResponse {
  roomId: string
  createdAt: string
  expiresAt: string
  hostToken: string
  websocketUrl: string
  shareUrl: string
  management: {
    validateUrl: string
    maxParticipants: number
    autoExpire: boolean
  }
}

export interface RoomValidationResponse {
  roomId: string
  valid: boolean
  message: string
  format: string
  example: string
}

export interface RoomListResponse {
  rooms: RoomInfo[]
  total: number
  note: string
}

export interface RoomInfo {
  roomId: string
  status: 'active' | 'inactive' | 'expired'
  participants: number
  createdAt: string
}

// サービス情報
export interface ServiceInfo {
  service: string
  runtime: string
  environment: string
  timestamp: string
  endpoints: Record<string, string>
  performance: {
    note: string
  }
}