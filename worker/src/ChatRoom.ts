/**
 * ChatRoom Durable Object
 * 複数ユーザー間でのWebSocketメッセージ共有を実現
 */

export interface ChatMessage {
  type: string
  data: any
  timestamp: string
  userId?: string
  username?: string
}

export class ChatRoom {
  state: DurableObjectState
  sessions: Set<WebSocket>
  users: Map<WebSocket, { userId: string; username: string }>

  constructor(state: DurableObjectState) {
    this.state = state
    this.sessions = new Set()
    this.users = new Map()
    
    console.log('🏠 [DURABLE] ChatRoom instance created')
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const roomId = url.pathname.split('/').pop() || 'unknown'
    
    console.log(`🔌 [DURABLE] WebSocket request for room: ${roomId}`)
    
    // WebSocketアップグレードチェック
    if (request.headers.get('Upgrade') !== 'websocket') {
      console.log(`❌ [DURABLE] No WebSocket upgrade header`)
      return new Response(JSON.stringify({
        error: 'Expected WebSocket',
        message: 'This endpoint only accepts WebSocket connections',
        roomId: roomId
      }), {
        status: 426,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    try {
      // WebSocketPairを作成
      const webSocketPair = new WebSocketPair()
      const [client, server] = Object.values(webSocketPair)

      console.log(`🔌 [DURABLE] Created WebSocketPair for room: ${roomId}`)

      // サーバー側WebSocketを受け入れてセッション管理
      this.handleSession(server, roomId)

      console.log(`✅ [DURABLE] WebSocket setup complete for room: ${roomId}`)
      console.log(`👥 [DURABLE] Current sessions: ${this.sessions.size}`)

      // クライアント側WebSocketを返す
      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    } catch (error) {
      console.error('💥 [DURABLE] WebSocket creation failed:', error)
      return new Response(JSON.stringify({
        error: 'WebSocket creation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  handleSession(ws: WebSocket, roomId: string): void {
    // WebSocketを受け入れ
    ws.accept()
    
    // セッション管理に追加
    this.sessions.add(ws)
    let userId: string | null = null
    let username: string | null = null
    
    console.log(`🎧 [DURABLE] Setting up event listeners for room: ${roomId}`)
    console.log(`👥 [DURABLE] Total sessions now: ${this.sessions.size}`)

    // メッセージ受信イベント
    ws.addEventListener('message', (event) => {
      console.log(`📨 [DURABLE] Message received in room ${roomId}: ${event.data}`)
      
      try {
        const message: ChatMessage = JSON.parse(event.data as string)
        console.log(`🎯 [DURABLE] Processing message type: ${message.type}`)

        switch (message.type) {
          case 'join_room':
            console.log(`👤 [DURABLE] User joining room ${roomId}`)
            userId = message.data?.userId || `user_${Date.now()}`
            username = message.data?.username || `User-${(userId || '').split('_')[2] || Math.random().toString(36).substr(2, 5)}`
            
            // ユーザー情報を保存
            if (userId && username) {
              this.users.set(ws, { userId, username })
            }
            
            // 参加成功通知
            ws.send(JSON.stringify({
              type: 'room_joined',
              data: {
                roomId: roomId,
                participantCount: this.sessions.size,
                userId: userId
              },
              timestamp: new Date().toISOString()
            }))
            
            // 他のユーザーに参加通知
            this.broadcast(JSON.stringify({
              type: 'user_joined',
              data: {
                userId: userId,
                username: username,
                roomId: roomId
              },
              timestamp: new Date().toISOString()
            }), ws)
            
            console.log(`✅ [DURABLE] User ${userId} (${username}) joined room ${roomId}`)
            break

          case 'send_message':
            console.log(`💬 [DURABLE] Processing message in room ${roomId}`)
            const chatMessage = message.data?.message || ''
            const userInfo = this.users.get(ws)
            const senderId = message.data?.userId || userInfo?.userId || 'unknown'
            // 優先順位: 1.クライアントから送信されたユーザー名 2.保存済みユーザー名 3.フォールバック
            const senderName = message.data?.username || userInfo?.username || `User-${senderId.split('_')[2] || 'unknown'}`
            
            console.log(`👤 [DURABLE] Message from userId: ${senderId}, username: ${senderName}`)

            if (chatMessage.trim()) {
              const broadcastMessage = JSON.stringify({
                type: 'message_received',
                data: {
                  message: chatMessage,
                  userId: senderId,
                  username: senderName,
                  roomId: roomId
                },
                timestamp: new Date().toISOString()
              })

              console.log(`📡 [DURABLE] Broadcasting message to ${this.sessions.size} sessions`)
              this.broadcast(broadcastMessage)
            }
            break

          case 'leave_room':
            console.log(`🚪 [DURABLE] User leaving room ${roomId}`)
            const leavingUser = this.users.get(ws)
            if (leavingUser) {
              // 他のユーザーに退出通知
              this.broadcast(JSON.stringify({
                type: 'user_left',
                data: {
                  userId: leavingUser.userId,
                  username: leavingUser.username,
                  roomId: roomId
                },
                timestamp: new Date().toISOString()
              }), ws)
            }
            
            ws.send(JSON.stringify({
              type: 'room_left',
              data: { roomId: roomId },
              timestamp: new Date().toISOString()
            }))
            break

          case 'ping':
            console.log('🏓 [DURABLE] Ping received')
            ws.send(JSON.stringify({
              type: 'pong',
              data: {},
              timestamp: new Date().toISOString()
            }))
            break

          default:
            console.log(`❓ [DURABLE] Unknown message type: ${message.type}`)
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: `Unknown message type: ${message.type}` },
              timestamp: new Date().toISOString()
            }))
        }
      } catch (error) {
        console.error(`❌ [DURABLE] Message processing error:`, error)
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Message processing failed' },
          timestamp: new Date().toISOString()
        }))
      }
    })

    // 接続終了イベント
    ws.addEventListener('close', (event) => {
      const userInfo = this.users.get(ws)
      console.log(`🚪 [DURABLE] Connection closed for room ${roomId}, user: ${userInfo?.userId || 'unknown'}`)
      
      // セッション管理から削除
      this.sessions.delete(ws)
      this.users.delete(ws)
      
      // 他のユーザーに退出通知
      if (userInfo) {
        this.broadcast(JSON.stringify({
          type: 'user_left',
          data: {
            userId: userInfo.userId,
            username: userInfo.username,
            roomId: roomId
          },
          timestamp: new Date().toISOString()
        }))
      }
      
      console.log(`👥 [DURABLE] Remaining sessions: ${this.sessions.size}`)
    })

    // エラーイベント
    ws.addEventListener('error', (event) => {
      const userInfo = this.users.get(ws)
      console.error(`💥 [DURABLE] WebSocket error for room ${roomId}, user: ${userInfo?.userId || 'unknown'}`, event)
    })
  }

  /**
   * 全セッションにメッセージをブロードキャスト
   * @param message 送信するメッセージ
   * @param exclude 送信を除外するWebSocket（送信者自身など）
   */
  broadcast(message: string, exclude?: WebSocket): void {
    let sentCount = 0
    let failedCount = 0
    
    for (const session of this.sessions) {
      // 除外対象をスキップ
      if (exclude && session === exclude) {
        continue
      }
      
      try {
        if (session.readyState === 1) { // WebSocket.OPEN
          session.send(message)
          sentCount++
        } else {
          // 無効なセッションを削除
          this.sessions.delete(session)
          this.users.delete(session)
          failedCount++
        }
      } catch (error) {
        console.error('❌ [DURABLE] Failed to send to session:', error)
        // エラーが発生したセッションを削除
        this.sessions.delete(session)
        this.users.delete(session)
        failedCount++
      }
    }
    
    console.log(`📤 [DURABLE] Broadcast complete: ${sentCount} sent, ${failedCount} failed/cleaned`)
  }
}