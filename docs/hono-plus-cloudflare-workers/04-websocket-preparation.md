# WebSocket準備・実装計画

## upgradeWebSocket 基本実装

### 基本的なWebSocketエンドポイント

```typescript
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/cloudflare-workers'

const app = new Hono<{ Bindings: Env }>()

app.get('/ws', upgradeWebSocket((c) => {
  return {
    onMessage(event, ws) {
      console.log(`Received message: ${event.data}`)
      
      try {
        const data = JSON.parse(event.data)
        // メッセージタイプ別の処理
        handleMessage(data, ws)
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid JSON format'
        }))
      }
    },

    onClose(event, ws) {
      console.log(`Connection closed: ${event.code} ${event.reason}`)
      // クリーンアップ処理
    },

    onError(event, ws) {
      console.error('WebSocket error:', event)
      // エラーハンドリング
    }
  }
}))

function handleMessage(data: any, ws: WebSocket) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
      break
    
    case 'join_room':
      // ルーム参加処理
      joinRoom(data.roomId, ws)
      break
      
    case 'send_message':
      // メッセージ送信処理
      broadcastMessage(data.roomId, data.message, ws)
      break
      
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${data.type}`
      }))
  }
}
```

## メッセージプロトコル設計

### 基本メッセージ構造

```typescript
// クライアント -> サーバー
interface ClientMessage {
  type: 'ping' | 'join_room' | 'leave_room' | 'send_message'
  timestamp: number
  data?: any
}

// サーバー -> クライアント
interface ServerMessage {
  type: 'pong' | 'room_joined' | 'room_left' | 'message' | 'error' | 'user_joined' | 'user_left'
  timestamp: number
  data?: any
}

// ルーム参加
interface JoinRoomMessage extends ClientMessage {
  type: 'join_room'
  data: {
    roomId: string
    userId: string
    username?: string
  }
}

// メッセージ送信
interface SendMessageMessage extends ClientMessage {
  type: 'send_message'
  data: {
    roomId: string
    message: string
    userId: string
  }
}
```

## Durable Objects を使用した状態管理

### なぜDurable Objectsが必要か

1. **複数クライアント間の調整**: チャットルーム、同期視聴などで必要
2. **状態の永続化**: ルーム情報、参加者リスト、メッセージ履歴
3. **スケーラビリティ**: 地理的に分散したクライアントの管理

### Durable Object基本実装

```typescript
// durable-objects/ChatRoom.ts
export class ChatRoom {
  private state: DurableObjectState
  private sessions: Set<WebSocket> = new Set()
  private users: Map<WebSocket, UserInfo> = new Map()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    server.addEventListener('message', (event) => {
      this.handleMessage(event.data, server)
    })

    server.addEventListener('close', () => {
      this.handleDisconnect(server)
    })

    server.accept()
    this.sessions.add(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private handleMessage(data: string, ws: WebSocket) {
    try {
      const message = JSON.parse(data)
      
      switch (message.type) {
        case 'join':
          this.handleJoin(message.data, ws)
          break
        case 'message':
          this.broadcast(message)
          break
        case 'sync_request':
          this.handleSyncRequest(ws)
          break
      }
    } catch (error) {
      this.sendError(ws, 'Invalid message format')
    }
  }

  private broadcast(message: any, excludeWs?: WebSocket) {
    const messageStr = JSON.stringify(message)
    this.sessions.forEach(ws => {
      if (ws !== excludeWs && ws.readyState === WebSocket.READY_STATE_OPEN) {
        ws.send(messageStr)
      }
    })
  }

  private handleDisconnect(ws: WebSocket) {
    this.sessions.delete(ws)
    const userInfo = this.users.get(ws)
    if (userInfo) {
      this.users.delete(ws)
      this.broadcast({
        type: 'user_left',
        data: { userId: userInfo.id, username: userInfo.username }
      })
    }
  }
}

interface UserInfo {
  id: string
  username: string
  joinedAt: number
}
```

### wrangler.toml でDurable Objects設定

```toml
# 既存設定に追加
[[durable_objects.bindings]]
name = "CHAT_ROOMS"
class_name = "ChatRoom"
script_name = "tiny-watch-party-worker"

[[durable_objects.migrations]]
tag = "v1"
new_classes = ["ChatRoom"]
```

## tiny-watch-party-plugin との統合

### Chrome拡張機能からの接続

```typescript
// Chrome拡張機能側のWebSocket接続
class WorkerWebSocketClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(private workerUrl: string) {}

  connect(roomId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.workerUrl}/ws`)
        
        this.ws.onopen = () => {
          console.log('Connected to worker')
          this.joinRoom(roomId, userId)
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data))
        }

        this.ws.onclose = (event) => {
          console.log('Connection closed:', event.code, event.reason)
          this.attemptReconnect(roomId, userId)
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

      } catch (error) {
        reject(error)
      }
    })
  }

  private joinRoom(roomId: string, userId: string) {
    this.send({
      type: 'join_room',
      timestamp: Date.now(),
      data: { roomId, userId }
    })
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private attemptReconnect(roomId: string, userId: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        console.log(`Reconnection attempt ${this.reconnectAttempts}`)
        this.connect(roomId, userId)
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }
}
```

## セキュリティ考慮事項

### レート制限

```typescript
// シンプルなレート制限実装
const rateLimiter = new Map<string, number[]>()

function isRateLimited(clientIp: string, limit = 60, window = 60000): boolean {
  const now = Date.now()
  const requests = rateLimiter.get(clientIp) || []
  
  // 古いリクエストを除去
  const validRequests = requests.filter(time => now - time < window)
  
  if (validRequests.length >= limit) {
    return true
  }
  
  validRequests.push(now)
  rateLimiter.set(clientIp, validRequests)
  return false
}
```

### 入力検証

```typescript
function validateMessage(data: any): boolean {
  if (!data || typeof data !== 'object') return false
  if (!data.type || typeof data.type !== 'string') return false
  if (!data.timestamp || typeof data.timestamp !== 'number') return false
  
  // メッセージタイプ別の検証
  switch (data.type) {
    case 'join_room':
      return data.data?.roomId && data.data?.userId
    case 'send_message':
      return data.data?.roomId && data.data?.message && data.data?.message.length <= 500
    default:
      return false
  }
}
```

## 開発・デバッグツール

### WebSocketテスト用HTML

```html
<!DOCTYPE html>
<html>
<head>
    <title>WebSocket Test</title>
</head>
<body>
    <div id="messages"></div>
    <input type="text" id="messageInput" placeholder="Enter message">
    <button onclick="sendMessage()">Send</button>
    
    <script>
        const ws = new WebSocket('ws://localhost:8787/ws');
        const messages = document.getElementById('messages');
        
        ws.onmessage = function(event) {
            const div = document.createElement('div');
            div.textContent = event.data;
            messages.appendChild(div);
        };
        
        function sendMessage() {
            const input = document.getElementById('messageInput');
            ws.send(JSON.stringify({
                type: 'send_message',
                timestamp: Date.now(),
                data: {
                    roomId: 'test-room',
                    message: input.value,
                    userId: 'test-user'
                }
            }));
            input.value = '';
        }
        
        // 接続時にルーム参加
        ws.onopen = function() {
            ws.send(JSON.stringify({
                type: 'join_room',
                timestamp: Date.now(),
                data: {
                    roomId: 'test-room',
                    userId: 'test-user',
                    username: 'Test User'
                }
            }));
        };
    </script>
</body>
</html>
```

## 次のステップ

1. ヘルスチェックAPIの動作確認後、WebSocket基本実装
2. 簡単な ping/pong で接続テスト
3. Durable Objects導入（必要に応じて）
4. Chrome拡張機能との統合
5. エラーハンドリング・再接続の実装
6. 本格的なメッセージプロトコル実装