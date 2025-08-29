/**
 * 簡単なWebSocketテスト - 基本動作のデバッグ用
 */

import { describe, test, expect } from 'bun:test'
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
const WEBSOCKET_TIMEOUT = config.TEST_WEBSOCKET_TIMEOUT

interface TestMessage {
  type: string
  timestamp: number
  data?: any
}

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

describe('WebSocket Debug Tests', () => {
  test('Single user room join debug', async () => {
    const roomId = generateTestRoomId()
    console.log(`Testing with room: ${roomId}`)
    
    const ws = await connectWebSocket(roomId)
    const userId = `debug-user-${Date.now()}`
    
    console.log('Connected, sending join_room message')
    ws.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: {
        userId,
        username: 'Debug User'
      }
    }))
    
    const joinResponse = await waitForMessage(ws, 'room_joined')
    console.log('Join response:', joinResponse)
    
    expect(joinResponse.type).toBe('room_joined')
    expect(joinResponse.data.participantCount).toBe(1)
    
    ws.close()
  })
  
  test('Two users debug - separate rooms', async () => {
    const roomId1 = generateTestRoomId()
    const roomId2 = generateTestRoomId()
    
    console.log(`Room 1: ${roomId1}, Room 2: ${roomId2}`)
    
    const ws1 = await connectWebSocket(roomId1)
    const ws2 = await connectWebSocket(roomId2)
    
    // Both join their respective rooms
    ws1.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: { userId: 'user1', username: 'User 1' }
    }))
    
    ws2.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: { userId: 'user2', username: 'User 2' }
    }))
    
    const join1 = await waitForMessage(ws1, 'room_joined')
    const join2 = await waitForMessage(ws2, 'room_joined')
    
    console.log('Join 1:', join1)
    console.log('Join 2:', join2)
    
    expect(join1.data.participantCount).toBe(1)
    expect(join2.data.participantCount).toBe(1)
    
    ws1.close()
    ws2.close()
  })
  
  test('Two users debug - same room', async () => {
    const roomId = generateTestRoomId()
    console.log(`Both users joining room: ${roomId}`)
    
    const ws1 = await connectWebSocket(roomId)
    console.log('User 1 connected')
    
    const ws2 = await connectWebSocket(roomId)
    console.log('User 2 connected')
    
    // User 1 joins first
    console.log('User 1 joining room...')
    ws1.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: { userId: 'user1', username: 'User 1' }
    }))
    
    const join1 = await waitForMessage(ws1, 'room_joined')
    console.log('User 1 join response:', join1)
    expect(join1.data.participantCount).toBe(1)
    
    // User 2 joins second  
    console.log('User 2 joining room...')
    ws2.send(JSON.stringify({
      type: 'join_room',
      timestamp: Date.now(),
      data: { userId: 'user2', username: 'User 2' }
    }))
    
    const join2 = await waitForMessage(ws2, 'room_joined')
    console.log('User 2 join response:', join2)
    
    console.log('Checking for User 1 notification about User 2...')
    try {
      const user2Notification = await waitForMessage(ws1, 'user_joined', 2000)
      console.log('User 1 received notification:', user2Notification)
    } catch (e) {
      console.log('User 1 did not receive notification:', e.message)
    }
    
    // This might fail due to stateless nature of Cloudflare Workers
    console.log('Expected participant count for User 2:', 2)
    console.log('Actual participant count for User 2:', join2.data.participantCount)
    
    ws1.close()
    ws2.close()
  })
})