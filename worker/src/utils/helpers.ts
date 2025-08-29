/**
 * 共通ヘルパー関数
 */

import { ErrorResponse, SecurityErrorCode } from '../types'

/**
 * 構造化エラーレスポンスを作成
 */
export const createErrorResponse = (
  code: SecurityErrorCode, 
  message: string, 
  context?: any
): ErrorResponse => ({
  type: 'error',
  code,
  message,
  timestamp: Date.now(),
  context
})

/**
 * 現在のタイムスタンプを取得
 */
export const getCurrentTimestamp = (): number => Date.now()

/**
 * ISO文字列でタイムスタンプを取得
 */
export const getCurrentISOTimestamp = (): string => new Date().toISOString()

/**
 * WebSocketのURL生成（開発・本番環境対応）
 */
export const generateWebSocketUrl = (host: string, roomId: string): string => {
  const protocol = host.includes('localhost') ? 'ws://' : 'wss://'
  return `${protocol}${host}/ws/${roomId}`
}

/**
 * ルーム共有URLの生成
 */
export const generateShareUrl = (roomId: string): string => {
  // TODO: 実際のフロントエンドURLに置き換える
  return `https://tiny-watch-party.example.com/join/${roomId}`
}

/**
 * パフォーマンス計測のヘルパー
 */
export const measurePerformance = <T>(
  operation: () => T | Promise<T>
): Promise<{ result: T; duration: number }> => {
  const start = performance.now()
  const result = Promise.resolve(operation())
  
  return result.then(value => ({
    result: value,
    duration: performance.now() - start
  }))
}

/**
 * ランダムな数値配列を生成（テスト用）
 */
export const generateTestData = (count: number): Array<{ id: number; value: number }> => {
  return Array.from({ length: count }, (_, i) => ({ 
    id: i, 
    value: Math.random() 
  }))
}

/**
 * テストデータをフィルタリング（パフォーマンステスト用）
 */
export const filterTestData = (
  data: Array<{ id: number; value: number }>
): Array<{ id: number; value: number; processed: boolean }> => {
  return data
    .filter(item => item.value > 0.5)
    .map(item => ({ ...item, processed: true }))
}

/**
 * URLからホスト名を抽出
 */
export const extractHostFromUrl = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return 'localhost:3000'
  }
}

/**
 * リクエストヘッダーからクライアントIPを取得
 */
export const getClientIP = (headers: { get?: (name: string) => string | null } | Record<string, string | undefined>): string => {
  // Cloudflare Workers用のget関数がある場合
  if (typeof (headers as any).get === 'function') {
    const cfIP = (headers as any).get('CF-Connecting-IP')
    const forwardedIP = (headers as any).get('X-Forwarded-For')
    return cfIP || forwardedIP || 'unknown'
  }
  
  // 通常のヘッダーオブジェクトの場合
  const headersObj = headers as Record<string, string | undefined>
  return headersObj['CF-Connecting-IP'] || headersObj['X-Forwarded-For'] || 'unknown'
}

/**
 * 安全な文字列切り捨て
 */
export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

/**
 * ランダムID生成用のベースヘルパー
 */
export const generateRandomId = (length: number, charset: string): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const randomArray = new Uint8Array(length)
    crypto.getRandomValues(randomArray)
    return Array.from(randomArray)
      .map(b => charset[b % charset.length])
      .join('')
  }
  
  // フォールバック（テスト環境のみ）
  return Array.from({ length }, () => 
    charset[Math.floor(Math.random() * charset.length)]
  ).join('')
}