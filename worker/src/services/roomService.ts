/**
 * ルーム管理ビジネスロジック
 */

import { UserInfo, RoomInfo, RoomCreateResponse } from '../types'
import { generateRoomId, generateHostToken, validateRoomId } from '../utils/room'
import { generateWebSocketUrl, generateShareUrl, getCurrentISOTimestamp } from '../utils/helpers'
import { CONFIG } from '../utils/config'

/**
 * ルーム管理サービス
 * インメモリでルーム状態を管理（Cloudflare Workers制限により単一接続のみ）
 */
export class RoomService {
  // インメモリストレージ（実際の本番環境ではDurable Objectsが必要）
  private roomSessions = new Map<string, Set<WebSocket>>()
  private roomUsers = new Map<string, Map<WebSocket, UserInfo>>()
  private roomCreatedAt = new Map<string, number>()

  /**
   * 新しいルームを作成
   */
  createRoom(host: string): RoomCreateResponse {
    const roomId = generateRoomId()
    const hostToken = generateHostToken()
    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + CONFIG.ROOM.EXPIRY_HOURS * 60 * 60 * 1000)

    return {
      roomId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      hostToken,
      websocketUrl: generateWebSocketUrl(host, roomId),
      shareUrl: generateShareUrl(roomId),
      management: {
        validateUrl: `/api/rooms/${roomId}/validate`,
        maxParticipants: CONFIG.ROOM.MAX_PARTICIPANTS,
        autoExpire: true
      }
    }
  }

  /**
   * ルームIDの検証
   */
  validateRoom(roomId: string): { valid: boolean; message: string } {
    const isValid = validateRoomId(roomId)
    return {
      valid: isValid,
      message: isValid ? 'Valid room ID format' : 'Invalid room ID format'
    }
  }

  /**
   * ユーザーをルームに参加させる
   */
  joinRoom(roomId: string, ws: WebSocket, userInfo: UserInfo): { success: boolean; participantCount: number } {
    console.log(`🏠 [ROOM-JOIN] User ${userInfo.id} joining room ${roomId}`)
    
    // ルーム作成（存在しない場合）
    if (!this.roomSessions.has(roomId)) {
      console.log(`🆕 [ROOM-JOIN] Creating new room ${roomId}`)
      this.roomSessions.set(roomId, new Set())
      this.roomUsers.set(roomId, new Map())
      this.roomCreatedAt.set(roomId, Date.now())
    } else {
      console.log(`🏠 [ROOM-JOIN] Room ${roomId} already exists`)
    }

    const sessions = this.roomSessions.get(roomId)!
    const users = this.roomUsers.get(roomId)!

    console.log(`🏠 [ROOM-JOIN] Current sessions in room: ${sessions.size}`)
    console.log(`🏠 [ROOM-JOIN] Max participants: ${CONFIG.ROOM.MAX_PARTICIPANTS}`)

    // 参加者数制限チェック
    if (sessions.size >= CONFIG.ROOM.MAX_PARTICIPANTS) {
      console.warn(`⚠️ [ROOM-JOIN] Room ${roomId} is full (${sessions.size}/${CONFIG.ROOM.MAX_PARTICIPANTS})`)
      return { success: false, participantCount: sessions.size }
    }

    // ユーザーをルームに追加
    sessions.add(ws)
    users.set(ws, userInfo)

    const newCount = sessions.size
    console.log(`✅ [ROOM-JOIN] Successfully added user ${userInfo.id} to room ${roomId}`)
    console.log(`👥 [ROOM-JOIN] New participant count: ${newCount}`)

    return { success: true, participantCount: newCount }
  }

  /**
   * ユーザーをルームから退出させる
   */
  leaveRoom(roomId: string, ws: WebSocket): { userInfo?: UserInfo; isEmpty: boolean } {
    const sessions = this.roomSessions.get(roomId)
    const users = this.roomUsers.get(roomId)

    if (!sessions || !users) {
      return { isEmpty: true }
    }

    const userInfo = users.get(ws)
    sessions.delete(ws)
    users.delete(ws)

    const isEmpty = sessions.size === 0

    // ルームが空になったらクリーンアップ
    if (isEmpty) {
      this.roomSessions.delete(roomId)
      this.roomUsers.delete(roomId)
      this.roomCreatedAt.delete(roomId)
    }

    return { userInfo, isEmpty }
  }

  /**
   * ルーム内の全ユーザーを取得
   */
  getRoomUsers(roomId: string): UserInfo[] {
    const users = this.roomUsers.get(roomId)
    if (!users) return []

    return Array.from(users.values())
  }

  /**
   * ルームの参加者数を取得
   */
  getParticipantCount(roomId: string): number {
    const sessions = this.roomSessions.get(roomId)
    return sessions ? sessions.size : 0
  }

  /**
   * ルーム内のWebSocket一覧を取得
   */
  getRoomSessions(roomId: string): WebSocket[] {
    const sessions = this.roomSessions.get(roomId)
    return sessions ? Array.from(sessions) : []
  }

  /**
   * WebSocketからユーザー情報を取得
   */
  getUserInfo(roomId: string, ws: WebSocket): UserInfo | undefined {
    const users = this.roomUsers.get(roomId)
    return users?.get(ws)
  }

  /**
   * ルームが存在するかチェック
   */
  roomExists(roomId: string): boolean {
    return this.roomSessions.has(roomId)
  }

  /**
   * デモ用のルーム一覧生成
   */
  generateDemoRooms(): RoomInfo[] {
    return [
      {
        roomId: generateRoomId(),
        status: 'active',
        participants: Math.floor(Math.random() * 5) + 1,
        createdAt: new Date(Date.now() - Math.random() * 3600000).toISOString()
      },
      {
        roomId: generateRoomId(),
        status: 'active',
        participants: Math.floor(Math.random() * 3) + 1,
        createdAt: new Date(Date.now() - Math.random() * 3600000).toISOString()
      }
    ]
  }

  /**
   * 全ルームの統計情報
   */
  getRoomStats(): { totalRooms: number; totalUsers: number; averageUsersPerRoom: number } {
    const totalRooms = this.roomSessions.size
    const totalUsers = Array.from(this.roomUsers.values()).reduce((sum, users) => sum + users.size, 0)
    const averageUsersPerRoom = totalRooms > 0 ? totalUsers / totalRooms : 0

    return {
      totalRooms,
      totalUsers,
      averageUsersPerRoom: Math.round(averageUsersPerRoom * 100) / 100
    }
  }
}