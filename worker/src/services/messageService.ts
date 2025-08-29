/**
 * メッセージ処理ビジネスロジック
 */

import { ClientMessage, ServerMessage, UserInfo } from '../types'
import { validateMessage, sanitizeHtml } from '../utils/room'
import { createErrorResponse, getCurrentTimestamp } from '../utils/helpers'
import { SecurityErrorCode } from '../utils/room'
import { CONFIG } from '../utils/config'

/**
 * メッセージ処理サービス
 */
export class MessageService {
  /**
   * クライアントメッセージを検証
   */
  validateClientMessage(message: any): { valid: boolean; error?: string } {
    return validateMessage(message)
  }

  /**
   * メッセージサイズを検証
   */
  validateMessageSize(data: string): boolean {
    return data.length <= CONFIG.SECURITY.MESSAGE.MAX_WEBSOCKET_MESSAGE_SIZE
  }

  /**
   * ping メッセージの処理
   */
  createPongResponse(): ServerMessage {
    return {
      type: 'pong',
      timestamp: getCurrentTimestamp()
    }
  }

  /**
   * ルーム参加成功メッセージの作成
   */
  createRoomJoinedMessage(roomId: string, participantCount: number, userId: string): ServerMessage {
    return {
      type: 'room_joined',
      timestamp: getCurrentTimestamp(),
      data: {
        roomId,
        participantCount,
        yourUserId: userId
      }
    }
  }

  /**
   * ルーム退出メッセージの作成
   */
  createRoomLeftMessage(roomId: string): ServerMessage {
    return {
      type: 'room_left',
      timestamp: getCurrentTimestamp(),
      data: { roomId }
    }
  }

  /**
   * ユーザー参加通知メッセージの作成
   */
  createUserJoinedMessage(userInfo: UserInfo): ServerMessage {
    return {
      type: 'user_joined',
      timestamp: getCurrentTimestamp(),
      data: {
        userId: userInfo.id,
        username: userInfo.username
      }
    }
  }

  /**
   * ユーザー退出通知メッセージの作成
   */
  createUserLeftMessage(userInfo: UserInfo): ServerMessage {
    return {
      type: 'user_left',
      timestamp: getCurrentTimestamp(),
      data: {
        userId: userInfo.id,
        username: userInfo.username
      }
    }
  }

  /**
   * チャットメッセージの作成（サニタイズ付き）
   */
  createChatMessage(message: string, userId: string, username?: string): ServerMessage {
    const sanitizedMessage = sanitizeHtml(message)
    const sanitizedUsername = username ? sanitizeHtml(username) : 'Anonymous'
    const sanitizedUserId = sanitizeHtml(userId)

    return {
      type: 'message',
      timestamp: getCurrentTimestamp(),
      data: {
        message: sanitizedMessage,
        userId: sanitizedUserId,
        username: sanitizedUsername
      }
    }
  }

  /**
   * ユーザー情報をサニタイズして作成
   */
  createSanitizedUserInfo(userId: string, username?: string): UserInfo {
    const sanitizedUserId = sanitizeHtml(userId)
    const sanitizedUsername = username 
      ? sanitizeHtml(username) 
      : `User-${sanitizedUserId.slice(0, 6)}`

    return {
      id: sanitizedUserId,
      username: sanitizedUsername,
      joinedAt: getCurrentTimestamp()
    }
  }

  /**
   * エラーメッセージの作成
   */
  createErrorMessage(code: SecurityErrorCode, message: string, context?: any): ServerMessage {
    return createErrorResponse(code, message, context) as ServerMessage
  }

  /**
   * join_room メッセージデータを検証・サニタイズ
   */
  processJoinRoomMessage(data: any): { valid: boolean; userInfo?: UserInfo; error?: string } {
    if (!data?.userId || typeof data.userId !== 'string') {
      return { valid: false, error: 'userId is required for join_room' }
    }

    if (data.userId.length > CONFIG.SECURITY.MESSAGE.MAX_USER_ID_LENGTH) {
      return { valid: false, error: 'userId too long' }
    }

    if (data.username && data.username.length > CONFIG.SECURITY.MESSAGE.MAX_USERNAME_LENGTH) {
      return { valid: false, error: 'username too long' }
    }

    const userInfo = this.createSanitizedUserInfo(data.userId, data.username)
    return { valid: true, userInfo }
  }

  /**
   * send_message メッセージデータを検証・サニタイズ
   */
  processSendMessageMessage(data: any): { 
    valid: boolean; 
    message?: string; 
    userId?: string; 
    username?: string; 
    error?: string 
  } {
    if (!data?.message || typeof data.message !== 'string') {
      return { valid: false, error: 'message content is required' }
    }

    if (!data?.userId || typeof data.userId !== 'string') {
      return { valid: false, error: 'userId is required for send_message' }
    }

    if (data.message.length > CONFIG.SECURITY.MESSAGE.MAX_LENGTH) {
      return { valid: false, error: 'message too long' }
    }

    const sanitizedMessage = sanitizeHtml(data.message)
    const sanitizedUserId = sanitizeHtml(data.userId)
    const sanitizedUsername = data.username ? sanitizeHtml(data.username) : 'Anonymous'

    return {
      valid: true,
      message: sanitizedMessage,
      userId: sanitizedUserId,
      username: sanitizedUsername
    }
  }

  /**
   * JSON解析エラーのハンドリング
   */
  handleParseError(error: Error): ServerMessage {
    if (error instanceof SyntaxError) {
      return this.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, 'Invalid JSON format')
    }
    return this.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, 'Message processing error')
  }
}