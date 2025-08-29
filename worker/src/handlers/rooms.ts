/**
 * ルーム管理API ハンドラー
 */

import { HonoContext, RoomCreateResponse, RoomValidationResponse, RoomListResponse } from '../types'
import { RoomService } from '../services/roomService'
import { validateRoomIdParam, validateRequest } from '../middleware/validation'
import { ERROR_MESSAGES } from '../utils/config'
import { extractHostFromUrl } from '../utils/helpers'

/**
 * ルーム作成ハンドラー
 */
export const createRoomHandler = async (c: HonoContext, roomService: RoomService): Promise<Response> => {
  try {
    // リクエスト検証
    const validation = validateRequest(c, {
      allowedMethods: ['POST'],
      maxRequestSize: 1024 // 1KB
    })

    if (!validation.valid) {
      return c.json({
        error: 'Validation Error',
        details: validation.errors,
        warnings: validation.warnings
      }, 400)
    }

    // ホスト名を取得してルーム作成
    const host = extractHostFromUrl(c.req.url)
    const roomData = roomService.createRoom(host)

    // レスポンスヘッダー設定
    c.header('X-Room-Id', roomData.roomId)
    c.header('X-Host-Token', roomData.hostToken)

    return c.json(roomData, 201)

  } catch (error) {
    console.error('Error creating room:', error)
    return c.json({
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      message: 'Failed to create room'
    }, 500)
  }
}

/**
 * ルームバリデーションハンドラー
 */
export const validateRoomHandler = (c: HonoContext, roomService: RoomService): Response => {
  try {
    // ルームIDパラメータの検証
    const roomIdValidation = validateRoomIdParam(c)
    
    if (!roomIdValidation.valid) {
      return c.json(roomIdValidation.error, 400)
    }

    const roomId = roomIdValidation.roomId!
    const validation = roomService.validateRoom(roomId)

    const response: RoomValidationResponse = {
      roomId,
      valid: validation.valid,
      message: validation.message,
      format: 'XXXX-YYYY-ZZZZ (12 characters, A-Z and 0-9)',
      example: 'A3F2-8K9L-4MN7'
    }

    return c.json(response)

  } catch (error) {
    console.error('Error validating room:', error)
    return c.json({
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      message: 'Failed to validate room'
    }, 500)
  }
}

/**
 * ルーム一覧ハンドラー（デモ用）
 */
export const listRoomsHandler = (c: HonoContext, roomService: RoomService): Response => {
  try {
    // リクエスト検証
    const validation = validateRequest(c, {
      allowedMethods: ['GET'],
      allowedQueryParams: ['limit', 'offset', 'status']
    })

    if (validation.warnings.length > 0) {
      console.warn('Room list request warnings:', validation.warnings)
    }

    // デモ用のルーム一覧を生成
    const demoRooms = roomService.generateDemoRooms()

    const response: RoomListResponse = {
      rooms: demoRooms,
      total: demoRooms.length,
      note: 'This is demo data. Real implementation would use database.'
    }

    return c.json(response)

  } catch (error) {
    console.error('Error listing rooms:', error)
    return c.json({
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      message: 'Failed to list rooms'
    }, 500)
  }
}

/**
 * ルーム統計ハンドラー（管理用）
 */
export const roomStatsHandler = (c: HonoContext, roomService: RoomService): Response => {
  try {
    const stats = roomService.getRoomStats()

    return c.json({
      stats,
      timestamp: new Date().toISOString(),
      note: 'Statistics are based on in-memory data and will reset on worker restart'
    })

  } catch (error) {
    console.error('Error getting room stats:', error)
    return c.json({
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      message: 'Failed to get room statistics'
    }, 500)
  }
}

/**
 * ルーム詳細情報ハンドラー
 */
export const roomDetailHandler = (c: HonoContext, roomService: RoomService): Response => {
  try {
    const roomIdValidation = validateRoomIdParam(c)
    
    if (!roomIdValidation.valid) {
      return c.json(roomIdValidation.error, 400)
    }

    const roomId = roomIdValidation.roomId!
    const exists = roomService.roomExists(roomId)
    const participantCount = roomService.getParticipantCount(roomId)
    const users = roomService.getRoomUsers(roomId)

    return c.json({
      roomId,
      exists,
      participantCount,
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        joinedAt: new Date(user.joinedAt).toISOString()
      })),
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error getting room detail:', error)
    return c.json({
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      message: 'Failed to get room details'
    }, 500)
  }
}