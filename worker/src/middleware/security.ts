/**
 * セキュリティ関連ミドルウェア
 */

import { HonoContext } from '../types'
import { RateLimiter, SecurityErrorCode } from '../utils/room'
import { createErrorResponse, getClientIP } from '../utils/helpers'
import { CONFIG } from '../utils/config'

/**
 * 接続レート制限ミドルウェア
 */
export const connectionRateLimitMiddleware = (context: HonoContext) => {
  const clientIP = getClientIP(context.req.header as any)
  const identifier = `conn-${clientIP}`
  
  const isRateLimited = RateLimiter.isRateLimited(
    identifier,
    CONFIG.SECURITY.RATE_LIMIT.CONNECTIONS_PER_MINUTE,
    CONFIG.SECURITY.RATE_LIMIT.WINDOW_MS
  )

  if (isRateLimited) {
    const errorResponse = createErrorResponse(
      SecurityErrorCode.RATE_LIMITED,
      'Too many connection attempts',
      { remainingAttempts: RateLimiter.getRemainingAttempts(identifier, CONFIG.SECURITY.RATE_LIMIT.CONNECTIONS_PER_MINUTE) }
    )
    
    return {
      rateLimited: true,
      errorResponse,
      statusCode: 429
    }
  }

  return { rateLimited: false }
}

/**
 * メッセージレート制限チェック
 */
export const messageRateLimitCheck = (clientIP: string): { rateLimited: boolean; error?: any } => {
  const identifier = `msg-${clientIP}`
  
  const isRateLimited = RateLimiter.isRateLimited(
    identifier,
    CONFIG.SECURITY.RATE_LIMIT.MESSAGES_PER_MINUTE,
    CONFIG.SECURITY.RATE_LIMIT.WINDOW_MS
  )

  if (isRateLimited) {
    return {
      rateLimited: true,
      error: createErrorResponse(
        SecurityErrorCode.RATE_LIMITED,
        'Too many messages, please slow down',
        { remainingAttempts: RateLimiter.getRemainingAttempts(identifier, CONFIG.SECURITY.RATE_LIMIT.MESSAGES_PER_MINUTE) }
      )
    }
  }

  return { rateLimited: false }
}

/**
 * WebSocketメッセージサイズ検証
 */
export const validateWebSocketMessageSize = (data: string): { valid: boolean; error?: any } => {
  if (data.length > CONFIG.SECURITY.MESSAGE.MAX_WEBSOCKET_MESSAGE_SIZE) {
    return {
      valid: false,
      error: createErrorResponse(SecurityErrorCode.MESSAGE_TOO_LARGE, 'Message too large')
    }
  }
  
  return { valid: true }
}

/**
 * セキュリティヘッダーの設定
 */
export const securityHeadersMiddleware = async (context: HonoContext, next: () => Promise<void>) => {
  await next()
  
  // セキュリティヘッダーを追加
  context.header('X-Content-Type-Options', 'nosniff')
  context.header('X-Frame-Options', 'DENY')
  context.header('X-XSS-Protection', '1; mode=block')
  context.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // WebSocketエンドポイント以外にCSPを適用
  if (!context.req.url.includes('/ws/')) {
    context.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'")
  }
}

/**
 * パフォーマンス測定ミドルウェア
 */
export const performanceMiddleware = async (context: HonoContext, next: () => Promise<void>) => {
  const start = performance.now()
  await next()
  const end = performance.now()
  
  const responseTime = end - start
  context.header('X-Response-Time', `${responseTime}ms`)
  
  // 遅いリクエストをログに記録
  if (responseTime > CONFIG.SERVER.PERFORMANCE_THRESHOLD_MS) {
    console.warn(`Slow request detected: ${context.req.method} ${context.req.url} took ${responseTime}ms`)
  }
}

/**
 * CORS設定（設定ファイルベース）
 */
export const getCorsConfig = () => ({
  origin: CONFIG.CORS.ALLOWED_ORIGINS,
  allowHeaders: CONFIG.CORS.ALLOWED_HEADERS,
  allowMethods: CONFIG.CORS.ALLOWED_METHODS
})

/**
 * API エンドポイント認証ミドルウェア（将来拡張用）
 * 現在は基本的な検証のみ実装
 */
export const apiAuthMiddleware = async (context: HonoContext, next: () => Promise<void>) => {
  // 将来的にAPIキーやJWT認証を実装する場所
  // 現在は基本的なヘッダー検証のみ
  
  const userAgent = context.req.header('User-Agent')
  if (!userAgent || userAgent.length < 5) {
    console.warn('Suspicious request with invalid User-Agent:', {
      ip: getClientIP(context.req.header as any),
      userAgent,
      url: context.req.url
    })
  }
  
  await next()
}

/**
 * エラーハンドリング用のラッパー
 */
export const errorHandlingWrapper = <T>(
  handler: () => Promise<T> | T
): Promise<{ success: boolean; result?: T; error?: any }> => {
  try {
    const result = Promise.resolve(handler())
    return result.then(value => ({ success: true, result: value }))
  } catch (error) {
    return Promise.resolve({ success: false, error })
  }
}

/**
 * セキュリティ監査ログ
 */
export const logSecurityEvent = (
  eventType: 'RATE_LIMIT' | 'INVALID_MESSAGE' | 'SUSPICIOUS_ACTIVITY',
  details: {
    ip?: string
    userAgent?: string
    url?: string
    additional?: any
  }
): void => {
  console.warn(`[SECURITY] ${eventType}:`, {
    timestamp: new Date().toISOString(),
    ...details
  })
}