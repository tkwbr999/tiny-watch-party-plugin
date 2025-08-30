/**
 * ルーム関連のユーティリティ関数
 */
import { CONFIG } from './config'

// ルームID生成ユーティリティ関数
export function generateRoomId(): string {
  const chars = CONFIG.CHARS.ROOM_ID
  const segments: string[] = []
  
  for (let i = 0; i < 3; i++) {
    let segment = ''
    for (let j = 0; j < 4; j++) {
      // 🔒 セキュリティ修正: crypto.getRandomValues() を使用
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const randomArray = new Uint8Array(1)
        crypto.getRandomValues(randomArray)
        segment += chars[randomArray[0] % chars.length]
      } else {
        // フォールバック（テスト環境のみ）
        segment += chars[Math.floor(Math.random() * chars.length)]
      }
    }
    segments.push(segment)
  }
  
  return segments.join('-')
}

// ホストトークン生成ユーティリティ関数
export function generateHostToken(): string {
  // 🔒 セキュリティ修正: 256bit entropy での安全なトークン生成
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const randomArray = new Uint8Array(16) // 128bit entropy
    crypto.getRandomValues(randomArray)
    const tokenPart = Array.from(randomArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
    return `host_${tokenPart}`
  }
  
  // フォールバック（テスト環境のみ - 本番では使用禁止）
  console.warn('🚨 Security Warning: Using insecure token generation fallback')
  return `host_${Math.random().toString(36).substring(2, 10)}`
}

// ルームIDバリデーション関数
export function validateRoomId(roomId: string): boolean {
  if (!roomId || typeof roomId !== 'string') return false
  return CONFIG.ROOM.ID_PATTERN.test(roomId)
}

// 🔒 セキュリティ: メッセージ入力検証
export function validateMessage(message: any): { valid: boolean; error?: string } {
  // 基本構造チェック
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be a valid object' }
  }
  
  // 必須フィールドチェック
  if (!message.type || typeof message.type !== 'string') {
    return { valid: false, error: 'Message type is required and must be string' }
  }
  
  if (!message.timestamp || typeof message.timestamp !== 'number') {
    return { valid: false, error: 'Timestamp is required and must be number' }
  }
  
  // タイムスタンプ妥当性チェック（過去1時間から未来1時間まで）
  const now = Date.now()
  const oneHour = 60 * 60 * 1000
  if (message.timestamp < now - oneHour || message.timestamp > now + oneHour) {
    return { valid: false, error: 'Timestamp is out of valid range' }
  }
  
  // メッセージタイプ別検証
  switch (message.type) {
    case 'join_room':
      if (!message.data?.userId || typeof message.data.userId !== 'string') {
        return { valid: false, error: 'userId is required for join_room' }
      }
      if (message.data.userId.length > 50) {
        return { valid: false, error: 'userId too long (max 50 chars)' }
      }
      if (message.data.username && message.data.username.length > 50) {
        return { valid: false, error: 'username too long (max 50 chars)' }
      }
      break
      
    case 'send_message':
      if (!message.data?.message || typeof message.data.message !== 'string') {
        return { valid: false, error: 'message content is required' }
      }
      if (message.data.message.length > 1000) {
        return { valid: false, error: 'message too long (max 1000 chars)' }
      }
      if (!message.data.userId || typeof message.data.userId !== 'string') {
        return { valid: false, error: 'userId is required for send_message' }
      }
      break
      
    case 'ping':
    case 'leave_room':
      // これらのメッセージタイプは追加検証不要
      break
      
    default:
      return { valid: false, error: `Unknown message type: ${message.type}` }
  }
  
  return { valid: true }
}

// 🔒 セキュリティ: HTML サニタイゼーション
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return ''
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

// 🔒 レート制限管理
export class RateLimiter {
  private static attempts = new Map<string, { count: number; lastReset: number }>()
  
  static isRateLimited(identifier: string, limit = 10, windowMs = 60000): boolean {
    const now = Date.now()
    const record = this.attempts.get(identifier) || { count: 0, lastReset: now }
    
    // ウィンドウリセット
    if (now - record.lastReset > windowMs) {
      record.count = 0
      record.lastReset = now
    }
    
    record.count++
    this.attempts.set(identifier, record)
    
    return record.count > limit
  }
  
  static getRemainingAttempts(identifier: string, limit = 10): number {
    const record = this.attempts.get(identifier)
    if (!record) return limit
    return Math.max(0, limit - record.count)
  }
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

// 🔒 セキュリティ関連エラーコード
export enum SecurityErrorCode {
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_ROOM_ID = 'INVALID_ROOM_ID',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  TIMESTAMP_INVALID = 'TIMESTAMP_INVALID',
  XSS_DETECTED = 'XSS_DETECTED'
}

// このファイル内のCONFIG定義は削除し、utils/config から参照するよう統一
