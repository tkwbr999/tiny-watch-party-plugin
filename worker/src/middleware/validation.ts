/**
 * 入力検証ミドルウェア
 */

import { HonoContext } from '../types'
import { validateRoomId } from '../utils/room'
import { SecurityErrorCode } from '../utils/room'
import { createErrorResponse } from '../utils/helpers'

/**
 * ルームIDパラメータの検証
 */
export const validateRoomIdParam = (context: HonoContext): { valid: boolean; roomId?: string; error?: any } => {
  const roomId = context.req.param('roomId')
  
  if (!roomId) {
    return {
      valid: false,
      error: createErrorResponse(SecurityErrorCode.INVALID_ROOM_ID, 'Room ID is required')
    }
  }

  if (!validateRoomId(roomId)) {
    return {
      valid: false,
      error: createErrorResponse(SecurityErrorCode.INVALID_ROOM_ID, 'Invalid room ID format')
    }
  }

  return { valid: true, roomId }
}

/**
 * JSON リクエストボディの検証
 */
export const validateJsonBody = async (context: HonoContext): Promise<{ valid: boolean; data?: any; error?: any }> => {
  try {
    const contentType = context.req.header('Content-Type')
    
    if (!contentType?.includes('application/json')) {
      return {
        valid: false,
        error: createErrorResponse(SecurityErrorCode.INVALID_MESSAGE, 'Content-Type must be application/json')
      }
    }

    // Honoフレームワークを使用してJSONを解析
    // 注意: 実際の実装ではcontext.req.json()を使用する必要があります
    const data = {}  // プレースホルダー
    return { valid: true, data }
    
  } catch (error) {
    return {
      valid: false,
      error: createErrorResponse(SecurityErrorCode.INVALID_MESSAGE, 'Invalid JSON format')
    }
  }
}

/**
 * クエリパラメータの検証
 */
export const validateQueryParams = (
  context: HonoContext,
  allowedParams: string[] = []
): { valid: boolean; params: Record<string, string>; warnings: string[] } => {
  const url = new URL(context.req.url)
  const params: Record<string, string> = {}
  const warnings: string[] = []

  for (const [key, value] of url.searchParams.entries()) {
    if (allowedParams.length > 0 && !allowedParams.includes(key)) {
      warnings.push(`Unknown query parameter: ${key}`)
      continue
    }
    
    // 基本的なサニタイゼーション
    if (typeof value === 'string' && value.length <= 100) {
      params[key] = value.trim()
    } else {
      warnings.push(`Invalid value for parameter ${key}`)
    }
  }

  return {
    valid: warnings.length === 0,
    params,
    warnings
  }
}

/**
 * HTTP メソッドの検証
 */
export const validateHttpMethod = (
  context: HonoContext,
  allowedMethods: string[]
): { valid: boolean; error?: any } => {
  const method = context.req.method

  if (!allowedMethods.includes(method)) {
    return {
      valid: false,
      error: {
        error: 'Method Not Allowed',
        message: `Method ${method} is not allowed for this endpoint`,
        allowedMethods,
        timestamp: new Date().toISOString()
      }
    }
  }

  return { valid: true }
}

/**
 * リクエストサイズの検証
 */
export const validateRequestSize = (
  context: HonoContext,
  maxSizeBytes: number = 1024 * 10  // 10KB default
): { valid: boolean; error?: any } => {
  const contentLength = context.req.header('Content-Length')
  
  if (contentLength) {
    const size = parseInt(contentLength)
    if (size > maxSizeBytes) {
      return {
        valid: false,
        error: createErrorResponse(
          SecurityErrorCode.MESSAGE_TOO_LARGE,
          `Request too large. Maximum size: ${maxSizeBytes} bytes`
        )
      }
    }
  }

  return { valid: true }
}

/**
 * User-Agent の基本検証
 */
export const validateUserAgent = (context: HonoContext): { valid: boolean; suspicious: boolean; userAgent: string } => {
  const userAgent = context.req.header('User-Agent') || ''
  
  // 基本的な形式チェック
  const valid = userAgent.length > 5 && userAgent.length < 500
  
  // 疑わしいUser-Agentパターンの検出
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /python/i,
    /curl/i,
    /wget/i,
    /postman/i
  ]
  
  const suspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent))
  
  return { valid, suspicious, userAgent }
}

/**
 * ホスト名の検証（SSRF対策）
 */
export const validateHostHeader = (context: HonoContext): { valid: boolean; host: string; error?: any } => {
  const host = context.req.header('Host') || ''
  
  // 基本的なホスト名形式の検証
  const hostPattern = /^[a-zA-Z0-9.-]+(?::\d+)?$/
  
  if (!hostPattern.test(host)) {
    return {
      valid: false,
      host,
      error: createErrorResponse(SecurityErrorCode.INVALID_MESSAGE, 'Invalid Host header')
    }
  }

  // 許可されたホストのホワイトリスト（本番環境では設定ファイルから読み込み）
  const allowedHosts = [
    'localhost:3000',
    'localhost:8787',
    'tiny-watch-party.example.com'
  ]

  // 開発環境では localhost パターンを許可
  const isLocalhost = host.startsWith('localhost:')
  const isAllowedHost = allowedHosts.includes(host)

  if (!isLocalhost && !isAllowedHost) {
    console.warn(`Potentially suspicious Host header: ${host}`)
  }

  return { valid: true, host }
}

/**
 * 包括的なリクエスト検証
 */
export const validateRequest = (
  context: HonoContext,
  options: {
    requireRoomId?: boolean
    allowedMethods?: string[]
    maxRequestSize?: number
    allowedQueryParams?: string[]
  } = {}
): {
  valid: boolean
  roomId?: string
  errors: any[]
  warnings: string[]
} => {
  const errors: any[] = []
  const warnings: string[] = []
  let roomId: string | undefined

  // HTTP メソッド検証
  if (options.allowedMethods) {
    const methodValidation = validateHttpMethod(context, options.allowedMethods)
    if (!methodValidation.valid) {
      errors.push(methodValidation.error)
    }
  }

  // リクエストサイズ検証
  if (options.maxRequestSize) {
    const sizeValidation = validateRequestSize(context, options.maxRequestSize)
    if (!sizeValidation.valid) {
      errors.push(sizeValidation.error)
    }
  }

  // ルームID検証
  if (options.requireRoomId) {
    const roomIdValidation = validateRoomIdParam(context)
    if (!roomIdValidation.valid) {
      errors.push(roomIdValidation.error)
    } else {
      roomId = roomIdValidation.roomId
    }
  }

  // クエリパラメータ検証
  if (options.allowedQueryParams) {
    const queryValidation = validateQueryParams(context, options.allowedQueryParams)
    warnings.push(...queryValidation.warnings)
  }

  // ホスト名検証
  const hostValidation = validateHostHeader(context)
  if (!hostValidation.valid) {
    errors.push(hostValidation.error)
  }

  // User-Agent検証
  const uaValidation = validateUserAgent(context)
  if (uaValidation.suspicious) {
    warnings.push(`Suspicious User-Agent: ${uaValidation.userAgent}`)
  }

  return {
    valid: errors.length === 0,
    roomId,
    errors,
    warnings
  }
}