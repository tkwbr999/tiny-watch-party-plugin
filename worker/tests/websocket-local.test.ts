/**
 * WebSocket ローカルテスト
 * 開発サーバーでのWebSocket通信をテスト
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

const LOCAL_URL = 'http://localhost:3000'
const WS_URL = 'ws://localhost:3000'

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
      reject(new Error('WebSocket connection timeout'))
    }, 5000)
    
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
function waitForMessage(ws: WebSocket, messageType?: string, timeout = 3000): Promise<TestMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeout}ms for type: ${messageType || 'any'}`))
    }, timeout)

    const handler = (event: MessageEvent) => {
      try {
        const message: TestMessage = JSON.parse(event.data)
        console.log('Received message:', message)
        
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

// テスト用ルームID生成
function generateTestRoomId(): string {
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

describe('WebSocket Local Tests', () => {
  // サーバーが起動していることを確認
  beforeAll(async () => {
    try {
      const response = await fetch(`${LOCAL_URL}/health`)
      expect(response.status).toBe(200)
      const health = await response.json()
      expect(health.features.webSocket).toBe('✅')
      console.log('Server health check passed')
    } catch (error) {
      throw new Error('Local server is not running. Please start with: bun run dev --port 3000')
    }
  })

  test('Basic WebSocket connection test', async () => {
    const roomId = generateTestRoomId()
    console.log(`Testing room ID: ${roomId}`)
    
    const ws = await connectWebSocket(roomId)
    expect(ws.readyState).toBe(WebSocket.OPEN)
    console.log('WebSocket connection established')
    
    ws.close()
  })

  test('Ping/Pong test', async () => {
    const roomId = generateTestRoomId()
    const ws = await connectWebSocket(roomId)

    console.log('Sending ping message...')
    ws.send(JSON.stringify({
      type: 'ping',
      timestamp: Date.now()
    }))

    const pongMessage = await waitForMessage(ws, 'pong')
    expect(pongMessage.type).toBe('pong')
    expect(pongMessage.timestamp).toBeGreaterThan(0)
    console.log('Pong received successfully')

    ws.close()
  })

  test('Room join test', async () => {
    const roomId = generateTestRoomId()
    const ws = await connectWebSocket(roomId)
    const userId = `test-user-${Date.now()}`

    console.log('Joining room...')
    ws.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: {
        userId,
        username: 'Test User Local'
      }
    }))

    const joinMessage = await waitForMessage(ws, 'room_joined')
    expect(joinMessage.type).toBe('room_joined')
    expect(joinMessage.data.roomId).toBe(roomId)
    expect(joinMessage.data.participantCount).toBe(1)
    expect(joinMessage.data.yourUserId).toBe(userId)
    console.log('Room joined successfully')

    ws.close()
  })

  test('Message broadcast test', async () => {
    const roomId = generateTestRoomId()
    const ws1 = await connectWebSocket(roomId)
    const ws2 = await connectWebSocket(roomId)
    
    const user1Id = `user1-${Date.now()}`
    const user2Id = `user2-${Date.now()}`
    const testMessage = 'Hello from local test!'

    console.log('Both users joining room...')
    
    // User 1 joins
    ws1.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: { userId: user1Id, username: 'Local User 1' }
    }))

    const join1 = await waitForMessage(ws1, 'room_joined')
    expect(join1.data.participantCount).toBe(1)

    // User 2 joins
    ws2.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: { userId: user2Id, username: 'Local User 2' }
    }))

    const join2 = await waitForMessage(ws2, 'room_joined')
    expect(join2.data.participantCount).toBe(2)

    // User 1 should get notification about User 2 joining
    const user2JoinNotification = await waitForMessage(ws1, 'user_joined')
    expect(user2JoinNotification.data.userId).toBe(user2Id)

    console.log('Sending test message...')
    
    // User 1 sends message
    ws1.send(JSON.stringify({
      type: 'send_message',
      timestamp: Date.now(),
      data: {
        userId: user1Id,
        username: 'Local User 1',
        message: testMessage
      }
    }))

    // User 2 should receive the message
    const receivedMessage = await waitForMessage(ws2, 'message')
    expect(receivedMessage.type).toBe('message')
    expect(receivedMessage.data.message).toBe(testMessage)
    expect(receivedMessage.data.userId).toBe(user1Id)

    console.log('Message broadcast test passed')

    ws1.close()
    ws2.close()
  })

  test('Error handling test', async () => {
    const roomId = generateTestRoomId()
    const ws = await connectWebSocket(roomId)

    console.log('Testing error handling with invalid JSON...')
    ws.send('invalid json string')

    const errorMessage = await waitForMessage(ws, 'error')
    expect(errorMessage.type).toBe('error')
    expect(errorMessage.data.message).toBe('Invalid JSON format')

    console.log('Error handling test passed')
    ws.close()
  })
})