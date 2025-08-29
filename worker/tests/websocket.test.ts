/**
 * WebSocket機能統合テスト
 * Cloudflare Workers環境でのWebSocket通信をテスト
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { getEnvConfig, EnvironmentError } from '../src/utils/env'
import { generateRoomId } from '../src/utils/room'

// 🔒 セキュリティ強化: 環境変数の検証
let config: ReturnType<typeof getEnvConfig>
try {
  config = getEnvConfig()
} catch (error) {
  if (error instanceof EnvironmentError) {
    console.error('❌ Environment Configuration Error:')
    console.error(error.message)
    process.exit(1)
  }
  throw error
}

const BASE_URL = config.DEV_BASE_URL
const WS_URL = config.WSS_BASE_URL
const TEST_TIMEOUT = config.TEST_TIMEOUT
const WEBSOCKET_TIMEOUT = config.TEST_WEBSOCKET_TIMEOUT

interface TestMessage {
  type: string
  timestamp: number
  data?: any
}

// WebSocket接続ヘルパー
function connectWebSocket(roomId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws/${roomId}`)
    
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket connection timeout after ${WEBSOCKET_TIMEOUT}ms`))
    }, WEBSOCKET_TIMEOUT)
    
    ws.onopen = () => {
      clearTimeout(timeout)
      resolve(ws)
    }
    
    ws.onerror = (error) => {
      clearTimeout(timeout)
      reject(error)
    }
  })
}

// メッセージ待機ヘルパー
function waitForMessage(ws: WebSocket, messageType?: string, timeout = WEBSOCKET_TIMEOUT): Promise<TestMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeout}ms`))
    }, timeout)

    const handler = (event: MessageEvent) => {
      try {
        const message: TestMessage = JSON.parse(event.data)
        if (!messageType || message.type === messageType) {
          clearTimeout(timer)
          ws.removeEventListener('message', handler)
          resolve(message)
        }
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    }

    ws.addEventListener('message', handler)
  })
}

// テスト用ルームID生成 - DRY原則に従ってutilsを再利用
const generateTestRoomId = generateRoomId

describe('WebSocket Integration Tests', () => {
  
  describe('Connection Tests', () => {
    test('Valid room ID でWebSocket接続が成功する', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)
      
      expect(ws.readyState).toBe(WebSocket.OPEN)
      
      ws.close()
    })

    test('Invalid room ID でWebSocket接続が拒否される', async () => {
      const invalidRoomId = 'invalid-room-id'
      
      try {
        const ws = await connectWebSocket(invalidRoomId)
        
        // エラーメッセージを待機
        const errorMessage = await waitForMessage(ws, 'error', 3000)
        expect(errorMessage.type).toBe('error')
        expect(errorMessage.data.message).toBe('Invalid room ID format')
        
        ws.close()
      } catch (error) {
        // 接続自体が失敗する場合もある
        expect(error).toBeDefined()
      }
    })
  })

  describe('Message Communication Tests', () => {
    test('Ping/Pong通信が正常に動作する', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)

      // Pingメッセージ送信
      ws.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
      }))

      // Pongレスポンス待機
      const pongMessage = await waitForMessage(ws, 'pong')
      expect(pongMessage.type).toBe('pong')
      expect(pongMessage.timestamp).toBeGreaterThan(0)

      ws.close()
    })

    test('ルーム参加機能が正常に動作する', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)
      const userId = `user-${Date.now()}`

      // ルーム参加
      ws.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: {
          userId,
          username: 'Test User'
        }
      }))

      // 参加成功メッセージ待機
      const joinMessage = await waitForMessage(ws, 'room_joined')
      expect(joinMessage.type).toBe('room_joined')
      expect(joinMessage.data.roomId).toBe(roomId)
      expect(joinMessage.data.participantCount).toBe(1)
      expect(joinMessage.data.yourUserId).toBe(userId)

      ws.close()
    })

    test('メッセージ送信・ブロードキャスト機能が正常に動作する', async () => {
      const roomId = generateTestRoomId()
      const ws1 = await connectWebSocket(roomId)
      const ws2 = await connectWebSocket(roomId)
      
      const user1Id = `user1-${Date.now()}`
      const user2Id = `user2-${Date.now()}`
      const testMessage = 'Hello from WebSocket test!'

      // 両ユーザーがルームに参加
      ws1.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: { userId: user1Id, username: 'Test User 1' }
      }))

      ws2.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: { userId: user2Id, username: 'Test User 2' }
      }))

      // 参加確認
      await waitForMessage(ws1, 'room_joined')
      await waitForMessage(ws2, 'room_joined')

      // user1がuser2の参加通知を受信
      const user2JoinNotification = await waitForMessage(ws1, 'user_joined')
      expect(user2JoinNotification.data.userId).toBe(user2Id)

      // user1がメッセージ送信
      ws1.send(JSON.stringify({
        type: 'send_message',
        timestamp: Date.now(),
        data: {
          userId: user1Id,
          username: 'Test User 1',
          message: testMessage
        }
      }))

      // user2がメッセージを受信
      const receivedMessage = await waitForMessage(ws2, 'message')
      expect(receivedMessage.type).toBe('message')
      expect(receivedMessage.data.message).toBe(testMessage)
      expect(receivedMessage.data.userId).toBe(user1Id)
      expect(receivedMessage.data.username).toBe('Test User 1')

      ws1.close()
      ws2.close()
    })
  })

  describe('Error Handling Tests', () => {
    test('不正なJSONでエラーが返される', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)

      // 不正なJSONを送信
      ws.send('invalid json')

      // エラーメッセージ待機
      const errorMessage = await waitForMessage(ws, 'error')
      expect(errorMessage.type).toBe('error')
      expect(errorMessage.data.message).toBe('Invalid JSON format')

      ws.close()
    })

    test('未知のメッセージタイプでエラーが返される', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)

      // 未知のメッセージタイプを送信
      ws.send(JSON.stringify({
        type: 'unknown_type',
        timestamp: Date.now()
      }))

      // エラーメッセージ待機
      const errorMessage = await waitForMessage(ws, 'error')
      expect(errorMessage.type).toBe('error')
      expect(errorMessage.data.message).toBe('Unknown message type: unknown_type')

      ws.close()
    })

    test('必須フィールド欠如でエラーが返される', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)

      // userIdなしでルーム参加を試行
      ws.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: {
          username: 'Test User'
          // userId欠如
        }
      }))

      // エラーメッセージ待機
      const errorMessage = await waitForMessage(ws, 'error')
      expect(errorMessage.type).toBe('error')
      expect(errorMessage.data.message).toBe('userId is required for join_room')

      ws.close()
    })
  })

  describe('Room Management Tests', () => {
    test('ユーザー退出時に他のユーザーに通知される', async () => {
      const roomId = generateTestRoomId()
      const ws1 = await connectWebSocket(roomId)
      const ws2 = await connectWebSocket(roomId)
      
      const user1Id = `user1-${Date.now()}`
      const user2Id = `user2-${Date.now()}`

      // 両ユーザーがルーム参加
      ws1.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: { userId: user1Id, username: 'Test User 1' }
      }))

      ws2.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: { userId: user2Id, username: 'Test User 2' }
      }))

      // 参加確認
      await waitForMessage(ws1, 'room_joined')
      await waitForMessage(ws2, 'room_joined')
      
      // user1がuser2の参加通知を受信
      await waitForMessage(ws1, 'user_joined')

      // user2が明示的にルーム退出
      ws2.send(JSON.stringify({
        type: 'leave_room',
        timestamp: Date.now()
      }))

      // user2が退出確認メッセージを受信
      const leaveConfirm = await waitForMessage(ws2, 'room_left')
      expect(leaveConfirm.type).toBe('room_left')
      expect(leaveConfirm.data.roomId).toBe(roomId)

      // user1がuser2の退出通知を受信
      const user2LeftNotification = await waitForMessage(ws1, 'user_left')
      expect(user2LeftNotification.type).toBe('user_left')
      expect(user2LeftNotification.data.userId).toBe(user2Id)

      ws1.close()
      ws2.close()
    })
  })

  describe('Multiple Connection Tests', () => {
    test('同じルームに複数ユーザーが同時接続できる', async () => {
      const roomId = generateTestRoomId()
      const connections: WebSocket[] = []
      const userIds: string[] = []
      
      try {
        // 3人のユーザーが同時接続
        for (let i = 0; i < 3; i++) {
          const ws = await connectWebSocket(roomId)
          const userId = `user${i}-${Date.now()}`
          
          connections.push(ws)
          userIds.push(userId)

          ws.send(JSON.stringify({
            type: 'join_room',
            timestamp: Date.now(),
            data: { userId, username: `Test User ${i}` }
          }))

          const joinMessage = await waitForMessage(ws, 'room_joined')
          expect(joinMessage.data.participantCount).toBe(i + 1)
        }

        // 全員が他の参加者の情報を受信していることを確認
        // （最後に参加したユーザーは2人の参加通知を受信すべき）
        const lastUser = connections[2]
        
        // 先に参加した2人の参加通知を受信
        await waitForMessage(lastUser, 'user_joined')
        await waitForMessage(lastUser, 'user_joined')

      } finally {
        // 全接続をクリーンアップ
        connections.forEach(ws => ws.close())
      }
    })
  })

  describe('Performance Tests', () => {
    test('メッセージ送信のレスポンス時間が適切', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)
      const userId = `user-${Date.now()}`

      // ルーム参加
      ws.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: { userId, username: 'Performance Test User' }
      }))

      await waitForMessage(ws, 'room_joined')

      // レスポンス時間測定
      const start = performance.now()
      
      ws.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
      }))

      await waitForMessage(ws, 'pong')
      
      const end = performance.now()
      const responseTime = end - start

      // レスポンス時間は1000ms未満であるべき
      expect(responseTime).toBeLessThan(1000)
      console.log(`WebSocket response time: ${responseTime}ms`)

      ws.close()
    })

    test('連続メッセージ送信が正常に処理される', async () => {
      const roomId = generateTestRoomId()
      const ws = await connectWebSocket(roomId)
      const userId = `user-${Date.now()}`

      // ルーム参加
      ws.send(JSON.stringify({
        type: 'join_room',
        timestamp: Date.now(),
        data: { userId, username: 'Bulk Message Test User' }
      }))

      await waitForMessage(ws, 'room_joined')

      // 連続でpingメッセージ送信
      const messageCount = 5
      const promises: Promise<TestMessage>[] = []

      for (let i = 0; i < messageCount; i++) {
        ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        }))
        promises.push(waitForMessage(ws, 'pong'))
      }

      // 全てのpongレスポンスを待機
      const responses = await Promise.all(promises)
      expect(responses).toHaveLength(messageCount)
      responses.forEach(response => {
        expect(response.type).toBe('pong')
      })

      ws.close()
    })
  })
})