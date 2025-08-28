/**
 * ルーム関連のユーティリティ関数
 */

// ルームID生成ユーティリティ関数
export function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segments: string[] = []
  
  for (let i = 0; i < 3; i++) {
    let segment = ''
    for (let j = 0; j < 4; j++) {
      segment += chars[Math.floor(Math.random() * chars.length)]
    }
    segments.push(segment)
  }
  
  return segments.join('-')
}

// ホストトークン生成ユーティリティ関数
export function generateHostToken(): string {
  // Crypto API使用（Cloudflare Workers対応）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `host_${crypto.randomUUID().split('-')[0]}`
  }
  // フォールバック（開発環境など）
  return `host_${Math.random().toString(36).substring(2, 10)}`
}

// ルームIDバリデーション関数
export function validateRoomId(roomId: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(roomId)
}

// ランタイム検出ユーティリティ
export const RuntimeDetector = {
  current: typeof Bun !== 'undefined' ? 'bun' : 'cloudflare-workers' as const,
  isBun: () => RuntimeDetector.current === 'bun',
  isCloudflareWorkers: () => RuntimeDetector.current === 'cloudflare-workers',
  getPerformanceNote: () => RuntimeDetector.isBun() 
    ? 'Local development with hot reload' 
    : 'Edge deployment with global distribution'
} as const

// 設定定数
export const CONFIG = {
  ROOM: {
    EXPIRY_HOURS: 3,
    MAX_PARTICIPANTS: 10,
    ID_PATTERN: /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  },
  SERVER: {
    DEFAULT_PORT: 3000,
    WRANGLER_PORT: 8787,
    PERFORMANCE_THRESHOLD_MS: 5000
  },
  CHARS: {
    ROOM_ID: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  }
} as const

// 型定義
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

export interface RoomValidationResult {
  roomId: string
  valid: boolean
  message: string
  format: string
  example: string
}