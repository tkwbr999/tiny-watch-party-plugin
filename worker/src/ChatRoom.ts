/**
 * ChatRoom Durable Object
 * 複数ユーザー間でのWebSocketメッセージ共有を実現
 */
import { MessageService } from './services/messageService'
import { validateRoomId, SecurityErrorCode } from './utils/room'
import { validateWebSocketMessageSize } from './middleware/security'

export interface ChatMessage {
  type: string
  data: any
  timestamp: number
  userId?: string
  username?: string
}

export class ChatRoom {
  state: DurableObjectState
  sessions: Set<WebSocket>
  users: Map<WebSocket, { userId: string; username: string }>
  messageService: MessageService
  lastCountdownAt?: number

  constructor(state: DurableObjectState) {
    this.state = state
    this.sessions = new Set()
    this.users = new Map()
    this.messageService = new MessageService()
    
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

      // まず受け入れ
      server.accept()

      // ルームID検証（不正ならエラーを送って終了）
      if (!validateRoomId(roomId)) {
        const err = this.messageService.createErrorMessage(SecurityErrorCode.INVALID_ROOM_ID, 'Invalid room ID format')
        server.send(JSON.stringify(err))
        try { server.close(1003, 'Invalid room id') } catch {}
      } else {
        // サーバー側WebSocketを受け入れてセッション管理
        this.handleSession(server, roomId)
      }

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
    
    // セッション管理に追加
    this.sessions.add(ws)
    let userId: string | null = null
    let username: string | null = null
    
    console.log(`🎧 [DURABLE] Setting up event listeners for room: ${roomId}`)
    console.log(`👥 [DURABLE] Total sessions now: ${this.sessions.size}`)

    // メッセージ受信イベント
    ws.addEventListener('message', (event) => {
      const raw = event.data as string
      console.log(`📨 [DURABLE] Message received in room ${roomId}: ${raw}`)

      const sizeCheck = validateWebSocketMessageSize(raw)
      if (!sizeCheck.valid) {
        ws.send(JSON.stringify(this.messageService.createErrorMessage(SecurityErrorCode.MESSAGE_TOO_LARGE, 'Message too large')))
        return
      }

      try {
        const message: ChatMessage = JSON.parse(raw)
        console.log(`🎯 [DURABLE] Processing message type: ${message.type}`)

        const baseValidation = this.messageService.validateClientMessage(message)
        if (!baseValidation.valid) {
          ws.send(JSON.stringify(this.messageService.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, baseValidation.error || 'Invalid message')))
          return
        }

        switch (message.type) {
          case 'countdown_request':
            {
              // 連続発火の抑止（3秒間）
              const now = Date.now()
              const minGapMs = 3000
              if (this.lastCountdownAt && (now - this.lastCountdownAt) < minGapMs) {
                // スルー（静かに無視）
                return
              }

              const durationMs = Math.min(Math.max(Number(message.data?.durationMs ?? 5000), 1000), 30000)
              const playLabelMs = Math.min(Math.max(Number(message.data?.playLabelMs ?? 1000), 500), 5000)
              // 2秒後に開始（ネットワーク/描画猶予）
              const startAt = now + 2000

              const payload = {
                type: 'countdown_start',
                data: {
                  startAt,
                  serverSentAt: now,
                  durationMs,
                  playLabelMs,
                  initiatorId: this.users.get(ws)?.userId || 'unknown'
                },
                timestamp: Date.now()
              }

              this.lastCountdownAt = now
              this.broadcast(JSON.stringify(payload))
            }
            break
          case 'join_room':
            console.log(`👤 [DURABLE] User joining room ${roomId}`)
            {
              const processed = this.messageService.processJoinRoomMessage(message.data)
              if (!processed.valid || !processed.userInfo) {
                ws.send(JSON.stringify(this.messageService.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, processed.error || 'Invalid join data')))
                return
              }

              userId = processed.userInfo.id
              username = processed.userInfo.username || null

              this.users.set(ws, { userId, username: username || '' })

              ws.send(JSON.stringify(this.messageService.createRoomJoinedMessage(
                roomId,
                this.sessions.size,
                userId
              )))

              this.broadcast(
                JSON.stringify(this.messageService.createUserJoinedMessage({ id: userId, username: username || undefined, joinedAt: Date.now() })),
                ws
              )
            }
            
            console.log(`✅ [DURABLE] User ${userId} (${username}) joined room ${roomId}`)
            break

          case 'send_message':
            console.log(`💬 [DURABLE] Processing message in room ${roomId}`)
            {
              const current = this.users.get(ws)
              const processed = this.messageService.processSendMessageMessage({
                message: message.data?.message,
                userId: message.data?.userId || current?.userId,
                username: message.data?.username || current?.username
              })

              if (!processed.valid || !processed.message || !processed.userId) {
                ws.send(JSON.stringify(this.messageService.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, processed.error || 'Invalid message data')))
                return
              }

              const broadcastMessage = this.messageService.createChatMessage(
                processed.message,
                processed.userId,
                processed.username
              )

              console.log(`📡 [DURABLE] Broadcasting message to ${this.sessions.size} sessions`)
              this.broadcast(JSON.stringify(broadcastMessage))
            }
            break

          case 'leave_room':
            console.log(`🚪 [DURABLE] User leaving room ${roomId}`)
            const leavingUser = this.users.get(ws)
            if (leavingUser) {
              // 他のユーザーに退出通知
              this.broadcast(
                JSON.stringify(this.messageService.createUserLeftMessage({ id: leavingUser.userId, username: leavingUser.username, joinedAt: Date.now() })),
                ws
              )
            }
            
            ws.send(JSON.stringify(this.messageService.createRoomLeftMessage(roomId)))
            break

          case 'ping':
            console.log('🏓 [DURABLE] Ping received')
            ws.send(JSON.stringify(this.messageService.createPongResponse()))
            break

          default:
            console.log(`❓ [DURABLE] Unknown message type: ${message.type}`)
            ws.send(JSON.stringify(this.messageService.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, `Unknown message type: ${message.type}`)))
        }
      } catch (error) {
        console.error(`❌ [DURABLE] Message processing error:`, error)
        const errMsg = error instanceof Error
          ? this.messageService.handleParseError(error)
          : this.messageService.createErrorMessage(SecurityErrorCode.INVALID_MESSAGE, 'Message processing failed')
        ws.send(JSON.stringify(errMsg))
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
        this.broadcast(JSON.stringify(this.messageService.createUserLeftMessage({ id: userInfo.userId, username: userInfo.username, joinedAt: Date.now() })))
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
