/**
 * WebSocket接続管理サービス
 */

import { ServerMessage, UserInfo } from '../types'
import { RoomService } from './roomService'
import { CONFIG } from '../utils/config'

/**
 * WebSocket接続とメッセージ送信を管理
 */
export class ConnectionService {
  constructor(private roomService: RoomService) {}

  /**
   * WebSocketが開いているかチェック
   */
  isWebSocketOpen(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.READY_STATE_OPEN
  }

  /**
   * 単一のWebSocketにメッセージを送信
   */
  sendMessage(ws: WebSocket, message: ServerMessage): boolean {
    if (!this.isWebSocketOpen(ws)) {
      return false
    }

    try {
      ws.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
      return false
    }
  }

  /**
   * ルーム内の全員（除外対象除く）にメッセージをブロードキャスト
   */
  broadcastToRoom(roomId: string, message: ServerMessage, excludeWs?: WebSocket): number {
    const sessions = this.roomService.getRoomSessions(roomId)
    let sentCount = 0

    sessions.forEach(ws => {
      if (ws !== excludeWs && this.sendMessage(ws, message)) {
        sentCount++
      }
    })

    return sentCount
  }

  /**
   * WebSocketを安全に閉じる
   */
  closeWebSocket(ws: WebSocket, code: number = CONFIG.WEBSOCKET.CLOSE_CODES.NORMAL, reason?: string): void {
    try {
      if (this.isWebSocketOpen(ws)) {
        ws.close(code, reason)
      }
    } catch (error) {
      console.error('Error closing WebSocket:', error)
    }
  }

  /**
   * ユーザー参加をルームに通知（自分以外）
   */
  notifyUserJoined(roomId: string, userInfo: UserInfo, excludeWs: WebSocket): number {
    const message: ServerMessage = {
      type: 'user_joined',
      timestamp: Date.now(),
      data: {
        userId: userInfo.id,
        username: userInfo.username
      }
    }

    return this.broadcastToRoom(roomId, message, excludeWs)
  }

  /**
   * ユーザー退出をルームに通知
   */
  notifyUserLeft(roomId: string, userInfo: UserInfo): number {
    const message: ServerMessage = {
      type: 'user_left',
      timestamp: Date.now(),
      data: {
        userId: userInfo.id,
        username: userInfo.username
      }
    }

    return this.broadcastToRoom(roomId, message)
  }

  /**
   * チャットメッセージをルーム内にブロードキャスト
   */
  broadcastChatMessage(
    roomId: string,
    message: string,
    userId: string,
    username: string
  ): number {
    const chatMessage: ServerMessage = {
      type: 'message',
      timestamp: Date.now(),
      data: {
        message,
        userId,
        username
      }
    }

    return this.broadcastToRoom(roomId, chatMessage)
  }

  /**
   * 接続統計情報を取得
   */
  getConnectionStats(): {
    totalConnections: number
    roomDistribution: Record<string, number>
  } {
    const stats = this.roomService.getRoomStats()
    const roomDistribution: Record<string, number> = {}

    // 各ルームの参加者数を収集（実際のデータベース実装では別途取得）
    // 現在はインメモリなので概算値のみ
    
    return {
      totalConnections: stats.totalUsers,
      roomDistribution
    }
  }

  /**
   * WebSocket接続のクリーンアップ
   * ルーム退出とリソース解放を一括実行
   */
  cleanupConnection(roomId: string, ws: WebSocket): {
    userInfo?: UserInfo
    notifiedCount: number
    roomCleaned: boolean
  } {
    // ユーザー情報を取得
    const userInfo = this.roomService.getUserInfo(roomId, ws)
    
    // ルームから退出
    const { isEmpty } = this.roomService.leaveRoom(roomId, ws)
    
    // 他のユーザーに退出を通知
    let notifiedCount = 0
    if (userInfo) {
      notifiedCount = this.notifyUserLeft(roomId, userInfo)
    }

    return {
      userInfo,
      notifiedCount,
      roomCleaned: isEmpty
    }
  }

  /**
   * エラー発生時のWebSocket処理
   */
  handleWebSocketError(roomId: string, ws: WebSocket, error: any): void {
    console.error(`WebSocket error in room ${roomId}:`, error)
    
    // 接続をクリーンアップ
    this.cleanupConnection(roomId, ws)
    
    // WebSocketを閉じる
    this.closeWebSocket(ws, CONFIG.WEBSOCKET.CLOSE_CODES.INVALID_DATA, 'Connection error')
  }

  /**
   * 接続タイムアウトまたは異常終了時の処理
   */
  handleWebSocketClose(roomId: string, ws: WebSocket, event: CloseEvent): void {
    console.log(`WebSocket connection closed for room ${roomId}: ${event.code} ${event.reason}`)
    
    // クリーンアップ処理
    this.cleanupConnection(roomId, ws)
  }
}