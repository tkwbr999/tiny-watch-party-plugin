(() => {
  if (window.__twpp_injected) {
    return;
  }

  // ウィンドウタイプ検出：ポップアップ/モーダルの場合は初期化をスキップ
  function isMainWindow() {
    // 1. window.opener がある場合はポップアップウィンドウと判定
    if (window.opener) {
      console.log('[TWPP] Skipping: Window has opener (popup window)');
      return false;
    }

    // 2. 認証系URLパターンをチェック
    const authPatterns = [
      /\/auth\//i,
      /\/oauth\//i,
      /\/login\//i,
      /\/signin\//i,
      /\/sso\//i,
      /\/callback\//i,
      /accounts\.google\.com/i,
      /login\.microsoftonline\.com/i,
      /github\.com\/login/i,
      /twitter\.com\/oauth/i,
      /facebook\.com\/dialog/i,
      /discord\.com\/api\/oauth/i
    ];

    const currentUrl = window.location.href;
    for (const pattern of authPatterns) {
      if (pattern.test(currentUrl)) {
        console.log('[TWPP] Skipping: Authentication URL detected -', currentUrl);
        return false;
      }
    }

    // 3. window.name に特定の文字列が含まれる場合は除外
    if (window.name) {
      const excludeNames = ['auth', 'popup', 'modal', 'oauth', 'login'];
      const windowName = window.name.toLowerCase();
      for (const name of excludeNames) {
        if (windowName.includes(name)) {
          console.log('[TWPP] Skipping: Window name contains excluded term -', window.name);
          return false;
        }
      }
    }

    // 4. ウィンドウサイズが小さすぎる場合は除外（一般的な認証ポップアップサイズ）
    if (window.innerWidth < 600 || window.innerHeight < 400) {
      console.log('[TWPP] Skipping: Window too small -', window.innerWidth, 'x', window.innerHeight);
      return false;
    }

    // 5. 親フレームがある場合（iframe内）は除外
    if (window.parent !== window) {
      console.log('[TWPP] Skipping: Running in iframe');
      return false;
    }

    console.log('[TWPP] Main window detected - proceeding with initialization');
    return true;
  }

  // メインウィンドウでない場合は初期化をスキップ
  if (!isMainWindow()) {
    return;
  }

  window.__twpp_injected = true;

  let isVisible = false;
  let messages = [];
  let backgroundOpacity = 5; // Default 5% opacity
  let windowPositionX = null;
  let windowPositionY = null;
  let currentColorTheme = 'neon'; // Default to neon blue
  let currentBgMode = 'dark'; // Default to dark mode ('dark' or 'light')

  // Timer state
  let timerStartTime = null;
  let timerInterval = null;
  let isTimerRunning = false;
  let timerOffset = 0;

  // WebSocket state
  let webSocket = null;
  let currentRoomId = null;
  let isHost = false;
  let hostToken = null;
  let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'error'
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 3;

  const STORAGE_KEYS = {
    visible: 'twpp_visible',
    messages: 'twpp_messages',
    timerStartTime: 'twpp_timer_start',
    timerOffset: 'twpp_timer_offset',
    backgroundOpacity: 'twpp_background_opacity',
    colorTheme: 'twpp_color_theme',
    bgMode: 'twpp_bg_mode',
    roomId: 'twpp_room_id',
    isHost: 'twpp_is_host',
    hostToken: 'twpp_host_token',
  };

  // カラーテーマ定義
  const COLOR_THEMES = {
    neon: {
      name: 'Neon Blue',
      border: 'rgba(3, 44, 112, 0.8)',
      buttonBg: 'rgba(3, 44, 112, 0.5)',
      accent: 'rgb(3, 44, 112)',
      titleBg: 'rgba(3, 44, 112, 0.15)',
      messageBorder: 'rgba(3, 44, 112, 0.6)',
      sliderThumb: 'rgba(3, 44, 112, 0.9)',
      timerHover: 'rgba(3, 44, 112, 0.3)',
    },
    purple: {
      name: 'Purple',
      border: 'rgba(147, 51, 234, 0.8)',
      buttonBg: 'rgba(147, 51, 234, 0.5)',
      accent: 'rgb(147, 51, 234)',
      titleBg: 'rgba(147, 51, 234, 0.15)',
      messageBorder: 'rgba(147, 51, 234, 0.6)',
      sliderThumb: 'rgba(147, 51, 234, 0.9)',
      timerHover: 'rgba(147, 51, 234, 0.3)',
    },
    pink: {
      name: 'Pink',
      border: 'rgba(236, 72, 153, 0.8)',
      buttonBg: 'rgba(236, 72, 153, 0.5)',
      accent: 'rgb(236, 72, 153)',
      titleBg: 'rgba(236, 72, 153, 0.15)',
      messageBorder: 'rgba(236, 72, 153, 0.6)',
      sliderThumb: 'rgba(236, 72, 153, 0.9)',
      timerHover: 'rgba(236, 72, 153, 0.3)',
    },
    orange: {
      name: 'Orange',
      border: 'rgba(251, 146, 60, 0.8)',
      buttonBg: 'rgba(251, 146, 60, 0.5)',
      accent: 'rgb(251, 146, 60)',
      titleBg: 'rgba(251, 146, 60, 0.15)',
      messageBorder: 'rgba(251, 146, 60, 0.6)',
      sliderThumb: 'rgba(251, 146, 60, 0.9)',
      timerHover: 'rgba(251, 146, 60, 0.3)',
    },
    green: {
      name: 'Green',
      border: 'rgba(34, 197, 94, 0.8)',
      buttonBg: 'rgba(34, 197, 94, 0.5)',
      accent: 'rgb(34, 197, 94)',
      titleBg: 'rgba(34, 197, 94, 0.15)',
      messageBorder: 'rgba(34, 197, 94, 0.6)',
      sliderThumb: 'rgba(34, 197, 94, 0.9)',
      timerHover: 'rgba(34, 197, 94, 0.3)',
    }
  };

  // WebSocket configuration - Cloudflare Workers固定
  const WS_CONFIG = {
    BASE_URL: 'wss://tiny-watch-party-worker.kickintheholdings.workers.dev',
    RECONNECT_INTERVAL: 3000,
    HEARTBEAT_INTERVAL: 30000,
  };

  // WebSocket client class
  class TinyWatchPartyWebSocket {
    constructor() {
      this.ws = null;
      this.roomId = null;
      this.userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      this.heartbeatInterval = null;
      this.reconnectTimeout = null;
      this.isConnecting = false;
    }

    connect(roomId) {
      console.log(`🔌 [TWPP-CONNECT] Attempting to connect to room: ${roomId}`);
      console.log(`🔌 [TWPP-CONNECT] Current state - roomId: ${this.roomId}, readyState: ${this.ws?.readyState}, isConnecting: ${this.isConnecting}`);
      
      // 既存の接続がある場合、異なるルームIDなら切断
      if (this.ws && this.roomId !== roomId) {
        console.log(`🔄 [TWPP-CONNECT] Disconnecting from previous room: ${this.roomId} -> ${roomId}`);
        this.disconnect();
      }
      
      // 既に同じルームに接続中または接続済みの場合はスキップ
      if (this.roomId === roomId && (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN))) {
        console.log(`✅ [TWPP-CONNECT] Already connected or connecting to room ${roomId}`);
        return;
      }

      this.roomId = roomId;
      this.isConnecting = true;
      updateConnectionStatus('connecting');

      try {
        const wsUrl = `${WS_CONFIG.BASE_URL}/ws/${roomId}`;
        console.log('[TWPP WebSocket] Connecting to:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('🔌 [TWPP-CLIENT] Connected to room:', roomId);
          console.log('🔌 [TWPP-CLIENT] WebSocket readyState:', this.ws.readyState);
          console.log('🔌 [TWPP-CLIENT] Connection URL:', wsUrl);
          this.isConnecting = false;
          connectionStatus = 'connected';
          reconnectAttempts = 0;
          updateConnectionStatus('connected');
          this.startHeartbeat();
          this.joinRoom();
        };

        this.ws.onmessage = (event) => {
          console.log('📨 [TWPP-CLIENT] Received message:', event.data);
          try {
            const message = JSON.parse(event.data);
            console.log('📨 [TWPP-CLIENT] Parsed message:', message);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ [TWPP-CLIENT] Failed to parse message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('[TWPP WebSocket] Connection closed:', event.code, event.reason);
          this.isConnecting = false;
          this.cleanup();
          
          if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            updateConnectionStatus('disconnected');
          }
        };

        this.ws.onerror = (error) => {
          console.error('[TWPP WebSocket] Connection error:', error);
          this.isConnecting = false;
          updateConnectionStatus('error');
        };

      } catch (error) {
        console.error('[TWPP WebSocket] Failed to create WebSocket:', error);
        this.isConnecting = false;
        updateConnectionStatus('error');
      }
    }

    joinRoom() {
      if (!this.isConnected()) {
        console.error('❌ [TWPP-CLIENT] Cannot join room: not connected');
        return;
      }
      
      const message = {
        type: 'join_room',
        timestamp: Date.now(),
        data: {
          userId: this.userId,
          username: `User-${this.userId.split('_')[2]}`
        }
      };

      console.log('👤 [TWPP-CLIENT] Joining room with:', message);
      this.send(message);
    }

    sendMessage(text) {
      if (!this.isConnected()) {
        console.error('❌ [TWPP-CLIENT] Cannot send message: not connected');
        return false;
      }

      const message = {
        type: 'send_message',
        timestamp: Date.now(),
        data: {
          userId: this.userId,
          username: currentUsername || `User-${this.userId.split('_')[2]}`,
          message: text
        }
      };

      console.log('💬 [TWPP-CLIENT] Sending message:', text);
      console.log('💬 [TWPP-CLIENT] Full message object:', message);
      this.send(message);
      return true;
    }

    send(message) {
      if (!this.isConnected()) {
        console.error('❌ [TWPP-CLIENT] Cannot send message: not connected');
        return;
      }

      try {
        const jsonMessage = JSON.stringify(message);
        console.log('📤 [TWPP-CLIENT] Sending raw JSON:', jsonMessage);
        this.ws.send(jsonMessage);
        console.log('✅ [TWPP-CLIENT] Message sent successfully');
      } catch (error) {
        console.error('❌ [TWPP-CLIENT] Failed to send message:', error);
      }
    }

    handleMessage(message) {
      console.log('🔄 [TWPP-CLIENT] Handling message type:', message.type);
      
      switch (message.type) {
        case 'user_joined':
          console.log('👤 [TWPP-CLIENT] User joined:', message.data?.username);
          addSystemMessage(`${message.data?.username || 'User'} が参加しました`);
          break;
          
        case 'user_left':
          console.log('👋 [TWPP-CLIENT] User left:', message.data?.username);
          addSystemMessage(`${message.data?.username || 'User'} が退出しました`);
          break;
          
        case 'message':
        case 'message_received':
          console.log('💬 [TWPP-CLIENT] Chat message from:', message.data?.userId);
          console.log('💬 [TWPP-CLIENT] My userId:', this.userId);
          if (message.data?.userId !== this.userId) {
            console.log('💬 [TWPP-CLIENT] Adding message from other user');
            addWebSocketMessage(message.data);
          } else {
            console.log('💬 [TWPP-CLIENT] Skipping own message');
          }
          break;

        case 'room_joined':
          console.log('🏠 [TWPP-CLIENT] Successfully joined room');
          addSystemMessage('ルームに正常に接続しました');
          break;

        case 'pong':
          console.log('🏓 [TWPP-CLIENT] Received pong');
          break;
          
        case 'error':
          console.error('❌ [TWPP-CLIENT] Server error:', message.data);
          addSystemMessage(`エラー: ${message.data?.message || 'Unknown error'}`);
          break;
          
        default:
          console.log('❓ [TWPP-CLIENT] Unknown message type:', message.type);
      }
    }

    startHeartbeat() {
      this.heartbeatInterval = setInterval(() => {
        if (this.isConnected()) {
          this.send({ type: 'ping', timestamp: Date.now() });
        }
      }, WS_CONFIG.HEARTBEAT_INTERVAL);
    }

    scheduleReconnect() {
      reconnectAttempts++;
      updateConnectionStatus('connecting');
      
      this.reconnectTimeout = setTimeout(() => {
        console.log(`[TWPP WebSocket] Reconnecting attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
        this.connect(this.roomId);
      }, WS_CONFIG.RECONNECT_INTERVAL);
    }

    isConnected() {
      console.log('🔍 [TWPP-CLIENT] Connection status check:');
      console.log('🔍 [TWPP-CLIENT]   - WebSocket object exists:', !!this.ws);
      console.log('🔍 [TWPP-CLIENT]   - readyState:', this.ws?.readyState);
      console.log('🔍 [TWPP-CLIENT]   - WebSocket states: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
      console.log('🔍 [TWPP-CLIENT]   - isConnecting flag:', this.isConnecting);
      console.log('🔍 [TWPP-CLIENT]   - roomId:', this.roomId);
      
      const connected = this.ws && this.ws.readyState === WebSocket.OPEN;
      console.log('🔍 [TWPP-CLIENT] Final result: connected =', connected);
      
      return connected;
    }

    disconnect() {
      this.cleanup();
      if (this.ws) {
        this.ws.close(1000, 'User disconnect');
        this.ws = null;
      }
      updateConnectionStatus('disconnected');
    }

    cleanup() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    }
  }

  // WebSocket client instance
  let wsClient = new TinyWatchPartyWebSocket();

  let sidebarContainer;
  let shadowRoot;
  let messagesList;
  let inputField;

  function htmlEscape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime() {
    const now = new Date();
    return now.toTimeString().slice(0, 8);
  }

  // Chrome API エラーハンドリングヘルパー
  function isExtensionContextInvalid(error) {
    return error && (
      error.message.includes('Extension context invalidated') ||
      error.message.includes('The extension context is invalidated')
    );
  }

  async function safeStorageGet(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      if (isExtensionContextInvalid(error)) {
        console.warn('[TWPP] Extension context invalidated during storage get');
        return {}; // デフォルト値を返す
      }
      throw error;
    }
  }

  async function safeStorageSet(items) {
    try {
      await chrome.storage.local.set(items);
      return true;
    } catch (error) {
      if (isExtensionContextInvalid(error)) {
        console.warn('[TWPP] Extension context invalidated during storage set');
        addSystemMessage('拡張機能が更新されました。ページを再読み込みしてください。', true);
        return false;
      }
      throw error;
    }
  }

  async function safeStorageRemove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (error) {
      if (isExtensionContextInvalid(error)) {
        console.warn('[TWPP] Extension context invalidated during storage remove');
        addSystemMessage('拡張機能が更新されました。ページを再読み込みしてください。', true);
        return false;
      }
      throw error;
    }
  }

  async function loadFromStorage() {
    try {
      const result = await safeStorageGet([
        STORAGE_KEYS.visible,
        STORAGE_KEYS.messages,
        STORAGE_KEYS.timerStartTime,
        STORAGE_KEYS.timerOffset,
        STORAGE_KEYS.backgroundOpacity,
        STORAGE_KEYS.colorTheme,
        STORAGE_KEYS.bgMode,
        STORAGE_KEYS.roomId,
        STORAGE_KEYS.isHost,
        STORAGE_KEYS.hostToken,
      ]);

      isVisible = result[STORAGE_KEYS.visible] || false;
      messages = result[STORAGE_KEYS.messages] || [];
      backgroundOpacity =
        result[STORAGE_KEYS.backgroundOpacity] !== undefined
          ? result[STORAGE_KEYS.backgroundOpacity]
          : 5;
      
      currentColorTheme = result[STORAGE_KEYS.colorTheme] || 'neon';
      currentBgMode = result[STORAGE_KEYS.bgMode] || 'dark';

      // Load WebSocket state
      currentRoomId = result[STORAGE_KEYS.roomId] || null;
      isHost = result[STORAGE_KEYS.isHost] || false;
      hostToken = result[STORAGE_KEYS.hostToken] || null;
      

      // タイマー状態を復元
      if (result[STORAGE_KEYS.timerStartTime]) {
        timerStartTime = result[STORAGE_KEYS.timerStartTime];
        timerOffset = result[STORAGE_KEYS.timerOffset] || 0;

        // タイマーが設定されている場合はUIを復元
        setTimeout(() => {
          const header = shadowRoot?.getElementById('header');
          if (header) {
            // ヘッダーをタイマーUIに変更
            const currentTime = Date.now();
            const elapsedSeconds = Math.floor((currentTime - timerStartTime) / 1000) + timerOffset;

            header.innerHTML = `
              <div id="timer-controls" style="
                display: flex; 
                gap: 8px; 
                align-items: center;
                width: 100%;
              ">
                <div id="timer-display" style="
                  flex: 1;
                  font-family: monospace, -apple-system, BlinkMacSystemFont;
                  font-size: 16px;
                  font-weight: bold;
                  color: rgba(255, 255, 255, 0.95);
                  text-shadow: 0 0 4px rgba(0, 0, 0, 1);
                  text-align: left;
                ">${formatTimerDisplay(elapsedSeconds)}</div>
                <button id="pause-button" style="
                  width: 40px;
                  height: 32px;
                  background: rgba(59, 130, 246, 0.3);
                  color: rgba(255, 255, 255, 0.95);
                  border: 1px solid rgba(59, 130, 246, 0.6);
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 16px;
                  text-shadow: 0 0 4px rgba(0, 0, 0, 1);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  transition: all 0.2s ease;
                ">⏸</button>
                <button id="reset-button" style="
                  width: 40px;
                  height: 32px;
                  background: rgba(239, 68, 68, 0.3);
                  color: rgba(255, 255, 255, 0.95);
                  border: 1px solid rgba(239, 68, 68, 0.6);
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 16px;
                  text-shadow: 0 0 4px rgba(0, 0, 0, 1);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  transition: all 0.2s ease;
                ">↺</button>
              </div>
            `;

            // イベントリスナーを設定
            setupTimerEventListeners();

            // タイマーを再開
            isTimerRunning = true;
            timerInterval = setInterval(updateTimerDisplay, 1000);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Storage load error:', error);
    }
  }

  async function saveToStorage() {
    await safeStorageSet({
      [STORAGE_KEYS.visible]: isVisible,
      [STORAGE_KEYS.messages]: messages,
      [STORAGE_KEYS.timerStartTime]: timerStartTime,
      [STORAGE_KEYS.timerOffset]: timerOffset,
      [STORAGE_KEYS.backgroundOpacity]: backgroundOpacity,
      [STORAGE_KEYS.colorTheme]: currentColorTheme,
      [STORAGE_KEYS.bgMode]: currentBgMode,
    });
  }

  function createSidebar() {
    sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'twpp-sidebar-container';
    shadowRoot = sidebarContainer.attachShadow({ mode: 'closed' });

    const sidebarHTML = `
      <style>
        #message-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }
        #message-input::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.5);
        }
        #message-input::-moz-placeholder {
          color: rgba(255, 255, 255, 0.5);
          opacity: 1;
        }
        
        .timer-segment {
          display: inline-block;
          min-width: 24px;
          text-align: center;
          transition: all 0.2s ease;
          user-select: none;
          cursor: ns-resize;
        }
        
        .timer-segment:hover {
          background: rgba(59, 130, 246, 0.2);
          border-radius: 3px;
          padding: 0 2px;
        }
      </style>
      <div id="sidebar" style="
        position: fixed;
        top: ${getInitialPositionY()}px;
        left: ${getInitialPositionX()}px;
        width: 300px;
        height: calc(100vh - 280px);
        background: rgba(0, 0, 0, ${backgroundOpacity / 100});
        border: 1px solid rgba(59, 130, 246, 0.6);
        border-radius: 8px;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 
          0 4px 20px rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
      ">
        <div id="title-bar" style="
          padding: 8px 12px;
          background: rgba(59, 130, 246, 0.1);
          border-bottom: 1px solid rgba(59, 130, 246, 0.6);
          border-radius: 7px 7px 0 0;
          cursor: move;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: bold;
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🎬</span>
            <span>Tiny Watch Party</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <div style="
              width: 8px; height: 8px; 
              background: rgba(255, 95, 87, 0.8); 
              border-radius: 50%;
            "></div>
            <div style="
              width: 8px; height: 8px; 
              background: rgba(255, 189, 46, 0.8); 
              border-radius: 50%;
            "></div>
            <div style="
              width: 8px; height: 8px; 
              background: rgba(40, 201, 64, 0.8); 
              border-radius: 50%;
            "></div>
          </div>
        </div>
        
        <div id="opacity-control" style="
          padding: 8px 12px;
          border-bottom: 1px solid rgba(59, 130, 246, 0.6);
          background: transparent;
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <!-- 背景モード切り替えボタン -->
            <div id="bg-mode-toggle" style="
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <button id="bg-mode-btn" style="
                width: 24px; height: 24px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: transparent;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
              " title="モード切り替え">🌙</button>
            </div>
            
            <input type="range" id="opacity-slider" min="0" max="100" value="5" style="
              width: 60%;
              height: 4px;
              background: rgba(255, 255, 255, 0.2);
              border-radius: 2px;
              outline: none;
              -webkit-appearance: none;
              cursor: pointer;
            ">
            
            <div id="color-picker" style="display: flex; gap: 4px;">
              <button class="color-btn" data-color="neon" style="
                width: 16px; height: 16px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgb(3, 44, 112);
                cursor: pointer;
                transition: all 0.2s ease;
              "></button>
              <button class="color-btn" data-color="purple" style="
                width: 16px; height: 16px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgb(147, 51, 234);
                cursor: pointer;
                transition: all 0.2s ease;
              "></button>
              <button class="color-btn" data-color="pink" style="
                width: 16px; height: 16px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgb(236, 72, 153);
                cursor: pointer;
                transition: all 0.2s ease;
              "></button>
              <button class="color-btn" data-color="orange" style="
                width: 16px; height: 16px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgb(251, 146, 60);
                cursor: pointer;
                transition: all 0.2s ease;
              "></button>
              <button class="color-btn" data-color="green" style="
                width: 16px; height: 16px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgb(34, 197, 94);
                cursor: pointer;
                transition: all 0.2s ease;
              "></button>
            </div>
          </div>
          <style>
            #opacity-slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 16px;
              height: 16px;
              background: rgba(59, 130, 246, 0.8);
              border-radius: 50%;
              cursor: pointer;
              box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
            }
            #opacity-slider::-moz-range-thumb {
              width: 16px;
              height: 16px;
              background: rgba(59, 130, 246, 0.8);
              border-radius: 50%;
              cursor: pointer;
              border: none;
              box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
            }
            .color-btn:hover {
              transform: scale(1.2);
              border: 2px solid rgba(255, 255, 255, 0.6);
            }
            .color-btn.active {
              border: 2px solid rgba(255, 255, 255, 0.9);
              box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
            }
            #bg-mode-btn:hover {
              background: rgba(255, 255, 255, 0.1);
              border: 2px solid rgba(255, 255, 255, 0.5);
            }
          </style>
        </div>
        
        <div id="header" style="
          padding: 8px 12px;
          border-bottom: 1px solid rgba(59, 130, 246, 0.6);
          background: transparent;
          text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
        ">
          <button id="countdown-button" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(59, 130, 246, 0.4);
            color: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(59, 130, 246, 0.6);
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            text-shadow: 0 0 4px rgba(0, 0, 0, 1);
            transition: all 0.2s ease;
          ">カウントダウン</button>
        </div>
        
        <div id="room-section" style="
          padding: 8px 12px;
          border-bottom: 1px solid rgba(59, 130, 246, 0.6);
          background: transparent;
          text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
        ">
          <!-- Room ID Display -->
          <div id="room-id-display" style="
            display: none;
            padding: 6px 8px;
            margin-bottom: 8px;
            background: rgba(0, 128, 0, 0.2);
            border: 1px solid rgba(0, 255, 0, 0.4);
            border-radius: 4px;
            color: rgba(255, 255, 255, 0.95);
            font-size: 12px;
            font-family: monospace;
            text-align: center;
            position: relative;
          ">
            <div style="font-size: 10px; opacity: 0.7; margin-bottom: 2px;">ルームID</div>
            <div id="room-id-text" style="font-weight: bold; letter-spacing: 1px;">----</div>
            <div style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: flex; gap: 2px;">
              <button id="copy-room-id" style="
                padding: 2px 4px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 2px;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                font-size: 10px;
                text-shadow: 0 0 4px rgba(0, 0, 0, 1);
              ">📋</button>
              <button id="leave-room-button" style="
                padding: 2px 4px;
                background: rgba(255, 100, 100, 0.2);
                border: 1px solid rgba(255, 100, 100, 0.4);
                border-radius: 2px;
                color: rgba(255, 200, 200, 0.9);
                cursor: pointer;
                font-size: 10px;
                text-shadow: 0 0 4px rgba(0, 0, 0, 1);
              ">🚪</button>
            </div>
          </div>
          
          <!-- Username Input (最優先) -->
          <div style="margin-bottom: 8px; padding: 8px; background: rgba(34, 197, 94, 0.1); border-radius: 4px; border: 1px solid rgba(34, 197, 94, 0.3);">
            <label style="
              display: block;
              font-size: 12px;
              color: rgba(255, 255, 255, 0.95);
              margin-bottom: 6px;
              font-weight: bold;
              text-shadow: 0 0 4px rgba(0, 0, 0, 1);
            ">👤 ユーザー名 <span style="color: rgba(255, 100, 100, 1); font-weight: bold;">*必須 (6文字以内)</span></label>
            <input type="text" id="username-input" placeholder="6文字以内で名前を入力 (例: ユーザー1)" required maxlength="6" style="
              width: 100%;
              padding: 8px 10px;
              border: 2px solid rgba(34, 197, 94, 0.8);
              border-radius: 4px;
              font-size: 13px;
              background: rgba(0, 0, 0, 0.4);
              color: rgba(255, 255, 255, 0.95);
              box-sizing: border-box;
              font-weight: 500;
            ">
            <div id="username-counter" style="
              font-size: 10px;
              color: rgba(255, 255, 255, 0.7);
              margin-top: 4px;
              text-align: right;
            ">0/6文字</div>
          </div>
          
          <!-- Create Room Button -->
          <button id="create-room-button" style="
            width: 100%;
            padding: 6px 12px;
            margin-bottom: 6px;
            background: rgba(34, 197, 94, 0.4);
            color: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(34, 197, 94, 0.6);
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            text-shadow: 0 0 4px rgba(0, 0, 0, 1);
            transition: all 0.2s ease;
          ">🎬 ルームを作成</button>
          
          <!-- Join Room Input -->
          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <input type="text" id="room-id-input" placeholder="ルームID (例: A3F2-8K9L-4MN7)" style="
              flex: 1;
              padding: 6px 8px;
              border: 1px solid rgba(59, 130, 246, 0.6);
              border-radius: 4px;
              font-size: 12px;
              background: rgba(0, 0, 0, 0.2);
              color: rgba(255, 255, 255, 0.95);
              font-family: monospace;
            ">
            <button id="join-room-button" style="
              padding: 6px 10px;
              background: rgba(147, 51, 234, 0.4);
              color: rgba(255, 255, 255, 0.95);
              border: 1px solid rgba(147, 51, 234, 0.6);
              border-radius: 4px;
              cursor: pointer;
              font-size: 12px;
              font-weight: bold;
              text-shadow: 0 0 4px rgba(0, 0, 0, 1);
            ">参加</button>
          </div>
          
          <!-- Connection Status -->
          <div id="connection-status" style="
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.7);
            padding: 4px 0;
          ">
            <div id="status-indicator" style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: rgba(156, 163, 175, 0.8);
            "></div>
            <span id="status-text">未接続</span>
          </div>
        </div>
        
        <div id="messages-container" style="
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          border-top: 1px solid rgba(59, 130, 246, 0.6);
          border-bottom: 1px solid rgba(59, 130, 246, 0.6);
        "></div>
        
        <div id="input-container" style="
          padding: 12px;
          border-top: 1px solid rgba(59, 130, 246, 0.6);
          background: transparent;
        ">
          <div style="display: flex; gap: 8px;">
            <input type="text" id="message-input" placeholder="メッセージ (Ctrl/Cmd+Enter または Shift+Enter で送信)" style="
              flex: 1;
              padding: 8px 12px;
              border: 1px solid ${COLOR_THEMES[currentColorTheme].border};
              border-radius: 4px;
              font-size: 14px;
              background: rgba(0, 0, 0, 0.2);
              color: rgba(255, 255, 255, 0.95);
            ">
            <button id="send-button" style="
              padding: 8px 16px;
              background: rgba(59, 130, 246, 0.4);
              color: rgba(255, 255, 255, 0.95);
              border: 1px solid rgba(59, 130, 246, 0.6);
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              text-shadow: 0 0 4px rgba(0, 0, 0, 1);
            ">送信</button>
          </div>
        </div>
        
      </div>
    `;

    shadowRoot.innerHTML = sidebarHTML;

    messagesList = shadowRoot.getElementById('messages-container');
    inputField = shadowRoot.getElementById('message-input');
    const sendButton = shadowRoot.getElementById('send-button');
    const countdownButton = shadowRoot.getElementById('countdown-button');

    // Enhanced key event control for input field
    setupInputEventListeners();
    setupDragFunctionality();
    setupWindowResizeHandler();
    setupColorPickerEvents();
    setupBgModeEvents();
    
    // 初回起動時にテーマと背景モードを適用
    applyColorTheme(currentColorTheme);
    updateColorButtonSelection(currentColorTheme);
    applyBgMode(currentBgMode);

    // Enhanced send button event control
    sendButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      sendMessage();
      inputField.focus(); // Maintain focus on input field
    });
    countdownButton.addEventListener('click', startCountdown);

    // WebSocket room management event handlers
    const createRoomButton = shadowRoot.getElementById('create-room-button');
    const joinRoomButton = shadowRoot.getElementById('join-room-button');
    const roomIdInput = shadowRoot.getElementById('room-id-input');
    const copyRoomIdButton = shadowRoot.getElementById('copy-room-id');

    createRoomButton.addEventListener('click', (e) => {
      e.preventDefault();
      createRoom();
    });

    joinRoomButton.addEventListener('click', (e) => {
      e.preventDefault();
      const roomId = roomIdInput.value.trim().toUpperCase();
      joinRoom(roomId);
    });

    roomIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const roomId = roomIdInput.value.trim().toUpperCase();
        joinRoom(roomId);
      }
    });

    // Format room ID input as user types
    roomIdInput.addEventListener('input', (e) => {
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      // Add hyphens in the correct positions
      if (value.length > 4) {
        value = value.substring(0, 4) + '-' + value.substring(4);
      }
      if (value.length > 9) {
        value = value.substring(0, 9) + '-' + value.substring(9, 13);
      }
      
      e.target.value = value;
    });

    copyRoomIdButton.addEventListener('click', (e) => {
      e.preventDefault();
      copyRoomId();
    });

    const leaveRoomButton = shadowRoot.getElementById('leave-room-button');
    leaveRoomButton.addEventListener('click', (e) => {
      e.preventDefault();
      leaveRoom();
    });

    // Opacity slider event listener
    const opacitySlider = shadowRoot.getElementById('opacity-slider');
    
    opacitySlider.addEventListener('input', (e) => {
      backgroundOpacity = parseInt(e.target.value);
      updateBackgroundOpacity();
      saveToStorage();
    });

    // Username character counter event listener
    const usernameInput = shadowRoot.getElementById('username-input');
    const usernameCounter = shadowRoot.getElementById('username-counter');
    
    if (usernameInput && usernameCounter) {
      usernameInput.addEventListener('input', (e) => {
        const length = e.target.value.length;
        usernameCounter.textContent = `${length}/6文字`;
        
        // Color coding
        if (length === 0) {
          usernameCounter.style.color = 'rgba(255, 255, 255, 0.7)';
        } else if (length <= 6) {
          usernameCounter.style.color = 'rgba(34, 197, 94, 0.8)';
        } else {
          usernameCounter.style.color = 'rgba(255, 100, 100, 0.9)';
        }
      });
    }

    document.documentElement.appendChild(sidebarContainer);
  }

  // モーダル化によりlayoutStyle機能は不要

  function getInitialPositionX() {
    // 常に右端から20pxの余白を確保
    return Math.max(20, window.innerWidth - 320);
  }

  function getInitialPositionY() {
    // 上から130pxの固定位置
    return 130;
  }

  function applyColorTheme(themeName) {
    const theme = COLOR_THEMES[themeName];
    if (!theme) {
      console.warn('[TWPP] Unknown color theme:', themeName);
      return;
    }

    const sidebar = shadowRoot.getElementById('sidebar');
    if (!sidebar) return;

    // モーダルボーダー
    sidebar.style.borderColor = theme.border;

    // タイトルバー
    const titleBar = shadowRoot.getElementById('title-bar');
    if (titleBar) {
      titleBar.style.background = theme.titleBg;
      titleBar.style.borderBottomColor = theme.border;
    }

    // 透明度コントロール下線
    const opacityControl = shadowRoot.getElementById('opacity-control');
    if (opacityControl) {
      opacityControl.style.borderBottomColor = theme.border;
    }

    // ヘッダー下線
    const header = shadowRoot.getElementById('header');
    if (header) {
      header.style.borderBottomColor = theme.border;
    }

    // カウントダウンボタン
    const countdownButton = shadowRoot.getElementById('countdown-button');
    if (countdownButton) {
      countdownButton.style.background = theme.buttonBg;
      countdownButton.style.borderColor = theme.border;
    }

    // メッセージエリアボーダー
    const messagesContainer = shadowRoot.getElementById('messages-container');
    if (messagesContainer) {
      messagesContainer.style.borderTopColor = theme.border;
      messagesContainer.style.borderBottomColor = theme.border;
    }

    // 入力エリア上線
    const inputContainer = shadowRoot.getElementById('input-container');
    if (inputContainer) {
      inputContainer.style.borderTopColor = theme.border;
    }

    // 送信ボタン
    const sendButton = shadowRoot.getElementById('send-button');
    if (sendButton) {
      sendButton.style.background = theme.buttonBg;
      sendButton.style.borderColor = theme.border;
    }

    // メッセージ入力フィールド
    const messageInput = shadowRoot.getElementById('message-input');
    if (messageInput) {
      messageInput.style.borderColor = theme.border;
    }

    // スライダーのつまみ色を更新
    const style = shadowRoot.querySelector('style');
    if (style) {
      let styleContent = style.textContent;
      styleContent = styleContent.replace(
        /#opacity-slider::-webkit-slider-thumb[\s\S]*?background: [^;]+;/,
        `#opacity-slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 16px;
              height: 16px;
              background: ${theme.sliderThumb};`
      );
      styleContent = styleContent.replace(
        /#opacity-slider::-moz-range-thumb[\s\S]*?background: [^;]+;/,
        `#opacity-slider::-moz-range-thumb {
              width: 16px;
              height: 16px;
              background: ${theme.sliderThumb};`
      );
      
      // タイマーホバー効果も更新
      if (styleContent.includes('.timer-segment:hover')) {
        styleContent = styleContent.replace(
          /\.timer-segment:hover[\s\S]*?background: [^;]+;/,
          `.timer-segment:hover {
            background: ${theme.timerHover};`
        );
      }
      
      style.textContent = styleContent;
    }

    // メッセージの左側ボーダーを更新
    const messageItems = shadowRoot.querySelectorAll('.message-item');
    messageItems.forEach(item => {
      item.style.borderLeftColor = theme.messageBorder;
    });

    // タイマー編集ボタンがあれば更新
    const editButtons = shadowRoot.querySelectorAll('.edit-timer-button');
    editButtons.forEach(button => {
      button.style.background = theme.buttonBg;
      button.style.borderColor = theme.border;
    });

    currentColorTheme = themeName;
    console.log('[TWPP] Color theme applied:', themeName);
  }

  function updateColorButtonSelection(activeTheme) {
    const colorButtons = shadowRoot.querySelectorAll('.color-btn');
    colorButtons.forEach(button => {
      const buttonTheme = button.getAttribute('data-color');
      if (buttonTheme === activeTheme) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }

  function applyBgMode(mode) {
    const sidebar = shadowRoot.getElementById('sidebar');
    if (!sidebar) return;
    
    // まず現在のモードを更新
    currentBgMode = mode;
    
    if (mode === 'light') {
      // ライトモード：白背景
      sidebar.style.background = `rgba(255, 255, 255, ${backgroundOpacity / 100})`;
      
      // テキストカラーを調整
      updateTextColorsForLightMode();
    } else {
      // ダークモード：黒背景（デフォルト）
      sidebar.style.background = `rgba(0, 0, 0, ${backgroundOpacity / 100})`;
      
      // テキストカラーを調整
      updateTextColorsForDarkMode();
    }
    
    // モード更新後にボタンのアイコンとタイトルを更新
    updateBgModeButtonDisplay();
    
    console.log('[TWPP] Background mode changed to:', mode);
  }

  function updateBgModeButtonDisplay() {
    const bgModeBtn = shadowRoot.getElementById('bg-mode-btn');
    if (!bgModeBtn) return;
    
    if (currentBgMode === 'dark') {
      // ダークモード（黒背景）時は月を表示
      bgModeBtn.textContent = '🌙';
      bgModeBtn.title = 'ライトモードに切り替え';
    } else {
      // ライトモード（白背景）時は太陽を表示
      bgModeBtn.textContent = '☀️';
      bgModeBtn.title = 'ダークモードに切り替え';
    }
  }

  function updateTextColorsForLightMode() {
    // タイトルバーのテキスト色
    const titleBar = shadowRoot.getElementById('title-bar');
    if (titleBar) {
      titleBar.style.color = 'rgba(0, 0, 0, 0.9)';
      titleBar.style.textShadow = '0 0 4px rgba(255, 255, 255, 0.8)';
    }

    // メッセージのテキスト色とタイマー表示を更新
    updateMessagesColorMode('light');
  }

  function updateTextColorsForDarkMode() {
    // タイトルバーのテキスト色
    const titleBar = shadowRoot.getElementById('title-bar');
    if (titleBar) {
      titleBar.style.color = 'rgba(255, 255, 255, 0.9)';
      titleBar.style.textShadow = '0 0 4px rgba(0, 0, 0, 0.8)';
    }

    // メッセージのテキスト色とタイマー表示を更新
    updateMessagesColorMode('dark');
  }

  function updateMessagesColorMode(mode) {
    // 既存のメッセージの背景色とテキスト色を更新
    renderMessages(); // メッセージを再レンダリングして色を適用
  }

  function adjustModalPositionOnResize() {
    const sidebar = shadowRoot.getElementById('sidebar');
    if (!sidebar) return;
    
    // 常に右端に再配置
    const newLeft = getInitialPositionX();
    const newTop = getInitialPositionY();
    
    sidebar.style.left = `${newLeft}px`;
    sidebar.style.top = `${newTop}px`;
    
    console.log('[TWPP] Modal repositioned to right edge due to window resize');
  }

  function updateBackgroundOpacity() {
    if (!shadowRoot) return;

    const sidebar = shadowRoot.getElementById('sidebar');
    
    if (sidebar) {
      // 現在の背景モードに応じて背景色を設定
      if (currentBgMode === 'light') {
        sidebar.style.background = `rgba(255, 255, 255, ${backgroundOpacity / 100})`;
      } else {
        sidebar.style.background = `rgba(0, 0, 0, ${backgroundOpacity / 100})`;
      }
    }
  }

  function renderMessages() {
    if (!messagesList || !shadowRoot) return;

    messagesList.innerHTML = '';

    messages.forEach((message) => {
      const messageElement = document.createElement('div');
      messageElement.className = 'message-item';
      
      // Different styling based on message type
      let messageBg, borderColor, textPrefix = '';
      
      switch (message.type) {
        case 'system':
          messageBg = currentBgMode === 'light' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.1)';
          borderColor = 'rgba(34, 197, 94, 0.6)';
          textPrefix = '🔔 ';
          break;
        case 'websocket':
          messageBg = currentBgMode === 'light' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)';
          borderColor = 'rgba(59, 130, 246, 0.6)';
          textPrefix = message.username ? `${message.username}: ` : '👤 ';
          break;
        case 'local':
        default:
          messageBg = currentBgMode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
          borderColor = COLOR_THEMES[currentColorTheme].messageBorder;
          textPrefix = '💬 ';
          break;
      }
      
      messageElement.style.cssText = `
        margin-bottom: 8px;
        padding: 8px 12px;
        background: ${messageBg};
        border-radius: 8px;
        border-left: 2px solid ${borderColor};
      `;

      messageElement.innerHTML = `
        <div style="
          font-size: 12px; 
          color: ${currentBgMode === 'light' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)'}; 
          margin-bottom: 4px;
          text-shadow: ${currentBgMode === 'light' ? '0 0 3px rgba(255, 255, 255, 0.8)' : '0 0 5px rgba(0, 0, 0, 1), 0 0 10px rgba(0, 0, 0, 0.9), 2px 2px 3px rgba(0, 0, 0, 1)'};
        ">
          ${htmlEscape(message.ts)}
        </div>
        <div style="
          color: ${currentBgMode === 'light' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)'}; 
          line-height: 1.4;
          font-weight: 500;
          text-shadow: ${currentBgMode === 'light' ? '0 0 3px rgba(255, 255, 255, 0.8)' : '0 0 6px rgba(0, 0, 0, 1), 0 0 15px rgba(0, 0, 0, 0.9), 3px 3px 5px rgba(0, 0, 0, 1)'};
        ">
          ${textPrefix}${htmlEscape(message.text)}
        </div>
      `;

      messagesList.appendChild(messageElement);
    });

    messagesList.scrollTop = messagesList.scrollHeight;
  }

  function setupInputEventListeners() {
    if (!inputField) return;
    
    console.log('[TWPP] Setting up simplified keyboard handlers');
    
    // シンプルで確実なキーボードハンドラー - キャプチャフェーズ
    inputField.addEventListener('keydown', (e) => {
      console.log(`[TWPP] Keydown: ${e.key || 'undefined'}, Ctrl: ${e.ctrlKey}, Meta: ${e.metaKey}, Shift: ${e.shiftKey}, Composing: ${e.isComposing}`);
      
      // 全てのキーイベントを即座にブロック（ビデオプレーヤー分離）
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Cmd+Enter / Ctrl+Enter / Shift+Enter での送信
      if (e.key === 'Enter' && !e.isComposing) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          console.log('[TWPP] Modifier+Enter detected, sending message');
          e.preventDefault();
          const text = inputField.value.trim();
          if (text) {
            sendMessage();
          }
          return false;
        }
        // 単純なEnterは無視（改行防止）
        console.log('[TWPP] Plain Enter blocked');
        e.preventDefault();
        return false;
      }
      
      // ビデオプレイヤーのショートカットをブロック
      const videoShortcuts = [' ', 'k', 'j', 'l', 'm', 'f', 'c', 't', 'i'];
      if (e.key && videoShortcuts.includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }, true);
    
    // バブルフェーズでも同じハンドラーを設定（Mac互換性のため）
    inputField.addEventListener('keydown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      if (e.key === 'Enter' && !e.isComposing && (e.metaKey || e.ctrlKey || e.shiftKey)) {
        console.log('[TWPP] Bubble phase: Modifier+Enter detected');
        e.preventDefault();
        const text = inputField.value.trim();
        if (text) {
          sendMessage();
        }
        return false;
      }
    }, false);
    
    // keyup and keypress events for complete isolation
    inputField.addEventListener('keyup', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
    
    inputField.addEventListener('keypress', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  }

  function setupDragFunctionality() {
    const titleBar = shadowRoot.getElementById('title-bar');
    const sidebar = shadowRoot.getElementById('sidebar');
    
    if (!titleBar || !sidebar) return;
    
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    function startDrag(e) {
      isDragging = true;
      
      // マウス or タッチイベントの座標取得
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      
      startX = clientX;
      startY = clientY;
      
      const rect = sidebar.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      titleBar.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      
      e.preventDefault();
    }
    
    function doDrag(e) {
      if (!isDragging) return;
      
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      
      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;
      
      // 画面外に出ないよう制限
      const sidebarRect = sidebar.getBoundingClientRect();
      const maxLeft = window.innerWidth - sidebarRect.width;
      const maxTop = window.innerHeight - sidebarRect.height;
      
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      
      sidebar.style.left = newLeft + 'px';
      sidebar.style.top = newTop + 'px';
      
      // 位置を保存
      windowPositionX = newLeft;
      windowPositionY = newTop;
      
      e.preventDefault();
    }
    
    function stopDrag() {
      if (!isDragging) return;
      
      isDragging = false;
      titleBar.style.cursor = 'move';
      document.body.style.userSelect = '';
      
      // 位置の保存は削除（一時的な移動のみ）
    }
    
    // マウスイベント
    titleBar.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    
    // タッチイベント
    titleBar.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', doDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
  }

  function setupBgModeEvents() {
    const bgModeBtn = shadowRoot.getElementById('bg-mode-btn');

    if (bgModeBtn) {
      bgModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // 現在のモードと逆のモードに切り替え
        const newMode = currentBgMode === 'dark' ? 'light' : 'dark';
        applyBgMode(newMode);
        saveToStorage();
        
        console.log('[TWPP] Switched to', newMode, 'mode');
      });
    }
    
    console.log('[TWPP] Background mode events setup completed');
  }

  function setupColorPickerEvents() {
    const colorButtons = shadowRoot.querySelectorAll('.color-btn');
    colorButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const selectedTheme = button.getAttribute('data-color');
        if (selectedTheme && COLOR_THEMES[selectedTheme]) {
          applyColorTheme(selectedTheme);
          updateColorButtonSelection(selectedTheme);
          saveToStorage();
          
          console.log('[TWPP] Color theme changed to:', selectedTheme);
        }
      });
      
      // ホバー効果のためのイベント（CSSで処理するが、ログ用）
      button.addEventListener('mouseenter', () => {
        const themeName = button.getAttribute('data-color');
        console.log('[TWPP] Hovering over color:', themeName);
      });
    });
    
    console.log('[TWPP] Color picker events setup completed');
  }

  function setupWindowResizeHandler() {
    let resizeDebounceTimer;
    
    window.addEventListener('resize', () => {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        adjustModalPositionOnResize();
      }, 150); // 150msの遅延でデバウンス処理
    });
    
    console.log('[TWPP] Window resize handler setup completed');
  }

  // WebSocket helper functions
  function updateConnectionStatus(status) {
    console.log(`🔄 [TWPP-STATUS] Connection status updated: ${connectionStatus} -> ${status}`);
    console.log(`🔄 [TWPP-STATUS] WebSocket details:`);
    console.log(`🔄 [TWPP-STATUS]   - wsClient exists:`, !!wsClient);
    console.log(`🔄 [TWPP-STATUS]   - WebSocket exists:`, !!wsClient?.ws);
    console.log(`🔄 [TWPP-STATUS]   - readyState:`, wsClient?.ws?.readyState);
    console.log(`🔄 [TWPP-STATUS]   - isConnecting:`, wsClient?.isConnecting);
    console.log(`🔄 [TWPP-STATUS]   - current roomId:`, currentRoomId);
    console.log(`🔄 [TWPP-STATUS]   - wsClient roomId:`, wsClient?.roomId);
    
    connectionStatus = status;
    
    if (!shadowRoot) {
      console.warn('⚠️ [TWPP-STATUS] shadowRoot not available for status update');
      return;
    }
    
    const statusIndicator = shadowRoot.getElementById('status-indicator');
    const statusText = shadowRoot.getElementById('status-text');
    
    if (!statusIndicator || !statusText) {
      console.warn('⚠️ [TWPP-STATUS] Status UI elements not found');
      return;
    }

    switch (status) {
      case 'connected':
        statusIndicator.style.background = 'rgba(34, 197, 94, 0.8)';
        statusText.textContent = `接続済み (${currentRoomId || '不明なルーム'})`;
        console.log('✅ [TWPP-STATUS] Status UI updated to CONNECTED');
        addSystemMessage(`WebSocket接続が確立されました (ルーム: ${currentRoomId})`);
        break;
      case 'connecting':
        statusIndicator.style.background = 'rgba(255, 189, 46, 0.8)';
        statusText.textContent = `接続中... (${currentRoomId || '不明なルーム'})`;
        console.log('⏳ [TWPP-STATUS] Status UI updated to CONNECTING');
        break;
      case 'error':
        statusIndicator.style.background = 'rgba(239, 68, 68, 0.8)';
        statusText.textContent = 'エラー';
        console.error('❌ [TWPP-STATUS] Status UI updated to ERROR');
        addSystemMessage('WebSocket接続エラーが発生しました');
        break;
      default:
        statusIndicator.style.background = 'rgba(156, 163, 175, 0.8)';
        statusText.textContent = '未接続';
        console.log('🔴 [TWPP-STATUS] Status UI updated to DISCONNECTED');
    }
    
    console.log(`🔄 [TWPP-STATUS] Status update completed: ${status}`);
  }

  function addSystemMessage(text, skipSave = false) {
    const message = {
      ts: formatTime(),
      text: text,
      type: 'system'
    };
    
    messages.push(message);
    renderMessages();
    
    // Extension context invalidated時の無限ループを防ぐ
    if (!skipSave) {
      saveToStorage();
    }
  }

  function addWebSocketMessage(data) {
    const message = {
      ts: formatTime(),
      text: data.message,
      type: 'websocket',
      userId: data.userId,
      username: data.username
    };
    
    messages.push(message);
    renderMessages();
    saveToStorage();
  }

  async function createRoom() {
    console.log('🏠 [TWPP-CREATE] Creating room...');
    console.log('🌐 [TWPP-CREATE] API endpoint:', `${WS_CONFIG.BASE_URL.replace('wss:', 'https:')}/api/rooms/create`);
    
    // Get username
    const usernameInput = shadowRoot.getElementById('username-input');
    const username = usernameInput ? usernameInput.value.trim() : '';
    
    if (!username) {
      addSystemMessage('⚠️ ユーザー名の入力が必要です。他のユーザーがあなたを識別できるよう、ユーザー名を入力してからルームを作成してください。');
      // Focus username input
      if (usernameInput) {
        usernameInput.focus();
        usernameInput.style.borderColor = 'rgba(255, 100, 100, 0.8)';
        setTimeout(() => {
          usernameInput.style.borderColor = 'rgba(34, 197, 94, 0.8)';
        }, 2000);
      }
      return;
    }

    if (username.length > 6) {
      addSystemMessage('⚠️ ユーザー名は6文字以内で入力してください。');
      // Focus username input
      if (usernameInput) {
        usernameInput.focus();
        usernameInput.style.borderColor = 'rgba(255, 100, 100, 0.8)';
        setTimeout(() => {
          usernameInput.style.borderColor = 'rgba(34, 197, 94, 0.8)';
        }, 2000);
      }
      return;
    }
    
    try {
      const createButton = shadowRoot.getElementById('create-room-button');
      if (createButton) {
        createButton.disabled = true;
        createButton.textContent = '作成中...';
      }

      // Call the WebSocket server API to create a room
      const response = await fetch(`${WS_CONFIG.BASE_URL.replace('wss:', 'https:')}/api/rooms/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ [TWPP-CREATE] Room created successfully:', data);
      console.log('🔗 [TWPP-CREATE] WebSocket URL:', data.websocketUrl);

      // Save room data
      currentRoomId = data.roomId;
      currentUsername = username;
      isHost = true;
      hostToken = data.hostToken;

      // Update UI
      displayRoomId(currentRoomId);
      
      // Clear username input
      if (usernameInput) usernameInput.value = '';
      
      // Save to storage
      const saveSuccess = await safeStorageSet({
        [STORAGE_KEYS.roomId]: currentRoomId,
        [STORAGE_KEYS.isHost]: isHost,
        [STORAGE_KEYS.hostToken]: hostToken
      });
      
      if (!saveSuccess) {
        return; // Extension context invalidated message already shown
      }

      // Connect to WebSocket
      console.log('🔌 [TWPP-CREATE] Connecting to WebSocket...');
      wsClient.connect(currentRoomId);
      
      addSystemMessage(`ルーム ${currentRoomId} を作成しました`);

    } catch (error) {
      console.error('[TWPP] Failed to create room:', error);
      if (isExtensionContextInvalid(error)) {
        addSystemMessage('拡張機能が更新されました。ページを再読み込みしてください。', true);
      } else {
        addSystemMessage(`ルーム作成エラー: ${error.message}`);
      }
    } finally {
      const createButton = shadowRoot.getElementById('create-room-button');
      if (createButton) {
        createButton.disabled = false;
        createButton.textContent = '🎬 ルームを作成';
      }
    }
  }

  function displayRoomId(roomId) {
    if (!shadowRoot) return;
    
    const roomDisplay = shadowRoot.getElementById('room-id-display');
    const roomIdText = shadowRoot.getElementById('room-id-text');
    
    if (roomDisplay && roomIdText) {
      roomIdText.textContent = roomId;
      roomDisplay.style.display = 'block';
    }
  }

  function hideRoomId() {
    const roomDisplay = shadowRoot?.getElementById('room-id-display');
    if (roomDisplay) {
      roomDisplay.style.display = 'none';
    }
  }

  async function joinRoom(roomId) {
    console.log('🚪 [TWPP-JOIN] Joining room:', roomId);
    console.log('🌐 [TWPP-JOIN] Validation endpoint:', `${WS_CONFIG.BASE_URL.replace('wss:', 'https:')}/api/rooms/${roomId}/validate`);
    
    if (!roomId || roomId.trim() === '') {
      addSystemMessage('ルームIDを入力してください');
      return;
    }

    // Get username
    const usernameInput = shadowRoot.getElementById('username-input');
    const username = usernameInput ? usernameInput.value.trim() : '';
    
    if (!username) {
      addSystemMessage('⚠️ ユーザー名の入力が必要です。他のユーザーがあなたを識別できるよう、ユーザー名を入力してからルームに参加してください。');
      // Focus username input
      if (usernameInput) {
        usernameInput.focus();
        usernameInput.style.borderColor = 'rgba(255, 100, 100, 0.8)';
        setTimeout(() => {
          usernameInput.style.borderColor = 'rgba(34, 197, 94, 0.8)';
        }, 2000);
      }
      return;
    }

    if (username.length > 6) {
      addSystemMessage('⚠️ ユーザー名は6文字以内で入力してください。');
      // Focus username input
      if (usernameInput) {
        usernameInput.focus();
        usernameInput.style.borderColor = 'rgba(255, 100, 100, 0.8)';
        setTimeout(() => {
          usernameInput.style.borderColor = 'rgba(34, 197, 94, 0.8)';
        }, 2000);
      }
      return;
    }

    // Validate room ID format
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(roomId)) {
      addSystemMessage('無効なルームID形式です (例: A3F2-8K9L-4MN7)');
      return;
    }

    try {
      const joinButton = shadowRoot.getElementById('join-room-button');
      if (joinButton) {
        joinButton.disabled = true;
        joinButton.textContent = '参加中...';
      }

      // Validate room exists
      const response = await fetch(`${WS_CONFIG.BASE_URL.replace('wss:', 'https:')}/api/rooms/${roomId}/validate`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const validation = await response.json();
      console.log('🔍 [TWPP-JOIN] Room validation result:', validation);
      
      if (!validation.valid) {
        console.error('❌ [TWPP-JOIN] Room validation failed:', validation.message);
        throw new Error('ルームが存在しません');
      }

      console.log('✅ [TWPP-JOIN] Room validation successful');

      // Save room data
      currentRoomId = roomId;
      currentUsername = username;
      isHost = false;
      hostToken = null;

      // Update UI
      displayRoomId(currentRoomId);
      
      // Clear inputs
      const roomInput = shadowRoot.getElementById('room-id-input');
      if (roomInput) roomInput.value = '';
      if (usernameInput) usernameInput.value = '';

      // Save to storage
      const saveSuccess = await safeStorageSet({
        [STORAGE_KEYS.roomId]: currentRoomId,
        [STORAGE_KEYS.isHost]: isHost,
        [STORAGE_KEYS.hostToken]: hostToken
      });
      
      if (!saveSuccess) {
        return; // Extension context invalidated message already shown
      }

      // Connect to WebSocket
      console.log('🔌 [TWPP-JOIN] Connecting to WebSocket...');
      wsClient.connect(currentRoomId);
      
      addSystemMessage(`ルーム ${currentRoomId} に参加しました`);

    } catch (error) {
      console.error('[TWPP] Failed to join room:', error);
      if (isExtensionContextInvalid(error)) {
        addSystemMessage('拡張機能が更新されました。ページを再読み込みしてください。', true);
      } else {
        addSystemMessage(`参加エラー: ${error.message}`);
      }
    } finally {
      const joinButton = shadowRoot.getElementById('join-room-button');
      if (joinButton) {
        joinButton.disabled = false;
        joinButton.textContent = '参加';
      }
    }
  }

  async function copyRoomId() {
    if (!currentRoomId) return;
    
    try {
      await navigator.clipboard.writeText(currentRoomId);
      addSystemMessage(`ルームID ${currentRoomId} をコピーしました`);
    } catch (error) {
      console.error('[TWPP] Failed to copy room ID:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = currentRoomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      addSystemMessage(`ルームID ${currentRoomId} をコピーしました`);
    }
  }

  async function leaveRoom() {
    console.log('🚪 [TWPP-LEAVE] Leaving room:', currentRoomId);
    
    if (!currentRoomId) {
      console.warn('⚠️ [TWPP-LEAVE] No active room to leave');
      addSystemMessage('参加中のルームがありません');
      return;
    }

    try {
      const previousRoomId = currentRoomId;

      // 1. WebSocket切断
      console.log('🔌 [TWPP-LEAVE] Disconnecting WebSocket...');
      if (wsClient) {
        wsClient.disconnect();
      }
      
      // 2. ローカル変数のクリア
      console.log('🧹 [TWPP-LEAVE] Clearing local variables...');
      currentRoomId = null;
      isHost = false;
      hostToken = null;
      
      // 3. ローカルストレージからルーム情報を削除
      console.log('💾 [TWPP-LEAVE] Removing room data from storage...');
      const removeSuccess = await safeStorageRemove([
        STORAGE_KEYS.roomId,
        STORAGE_KEYS.isHost,
        STORAGE_KEYS.hostToken
      ]);
      
      if (!removeSuccess) {
        console.error('❌ [TWPP-LEAVE] Failed to remove room data from storage');
        return; // Extension context invalidated message already shown
      }
      
      // 4. UI更新
      console.log('🖼️ [TWPP-LEAVE] Updating UI...');
      hideRoomId();
      updateConnectionStatus('disconnected');
      
      console.log(`✅ [TWPP-LEAVE] Successfully left room ${previousRoomId}`);
      addSystemMessage(`ルーム ${previousRoomId} から退出しました`);

    } catch (error) {
      console.error('❌ [TWPP-LEAVE] Failed to leave room:', error);
      if (isExtensionContextInvalid(error)) {
        addSystemMessage('拡張機能が更新されました。ページを再読み込みしてください。', true);
      } else {
        addSystemMessage(`退出エラー: ${error.message}`);
      }
    }
  }

  async function sendMessage() {
    console.log('💬 [TWPP-SEND] sendMessage() called');
    
    if (!inputField) {
      console.error('❌ [TWPP-SEND] No input field available');
      addSystemMessage('エラー: 入力フィールドが見つかりません');
      return;
    }

    const text = inputField.value.trim();
    console.log(`💬 [TWPP-SEND] Message text: "${text}" (length: ${text.length})`);
    
    if (!text) {
      console.log('⚠️ [TWPP-SEND] Empty message, not sending');
      return;
    }

    // WebSocketクライアントの詳細な状態確認
    console.log('🔍 [TWPP-SEND] WebSocket client status:');
    console.log('🔍 [TWPP-SEND]   - wsClient exists:', !!wsClient);
    console.log('🔍 [TWPP-SEND]   - current roomId:', currentRoomId);
    console.log('🔍 [TWPP-SEND]   - wsClient.roomId:', wsClient?.roomId);
    console.log('🔍 [TWPP-SEND]   - wsClient.userId:', wsClient?.userId);

    // WebSocket接続完了まで待機（最大3秒）
    if (wsClient && wsClient.isConnecting) {
      console.log('⏳ [TWPP-SEND] WebSocket is connecting, waiting for connection...');
      let retries = 0;
      const maxRetries = 6; // 3秒（6 * 500ms）
      
      while (wsClient.isConnecting && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
        console.log(`⏳ [TWPP-SEND] Waiting for connection... ${retries}/${maxRetries}`);
      }
    }

    // Try to send via WebSocket first, if connected
    let sentViaWebSocket = false;
    if (wsClient && wsClient.isConnected()) {
      console.log('✅ [TWPP-SEND] WebSocket is connected, attempting to send');
      sentViaWebSocket = wsClient.sendMessage(text);
      console.log('📤 [TWPP-SEND] WebSocket send result:', sentViaWebSocket);
      
      if (sentViaWebSocket) {
        console.log('🎉 [TWPP-SEND] Message successfully sent via WebSocket');
        addSystemMessage(`WebSocketでメッセージを送信しました: "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"`);
      } else {
        console.error('❌ [TWPP-SEND] Failed to send via WebSocket despite connection');
        addSystemMessage('エラー: WebSocketメッセージ送信に失敗しました');
      }
    } else {
      console.warn('⚠️ [TWPP-SEND] WebSocket not connected, using local mode');
      if (!wsClient) {
        console.error('❌ [TWPP-SEND] wsClient is null/undefined');
        addSystemMessage('エラー: WebSocketクライアントが初期化されていません');
      } else {
        console.log('🔍 [TWPP-SEND] Connection check will follow...');
        const connectionStatus = wsClient.isConnected();
        console.log('🔍 [TWPP-SEND] Connection status returned:', connectionStatus);
        if (!currentRoomId) {
          addSystemMessage('ルームに参加してください');
        } else {
          addSystemMessage('オフラインモード: WebSocket接続を確認中...');
        }
      }
    }

    // Always add to local messages for offline functionality
    const message = {
      ts: formatTime(),
      text: text,
      type: sentViaWebSocket ? 'websocket' : 'local',
      userId: wsClient?.userId || 'local_user'
    };

    messages.push(message);
    inputField.value = '';

    renderMessages();
    saveToStorage();
    
    console.log(`✅ [TWPP-SEND] Message processed successfully (${sentViaWebSocket ? 'WebSocket' : 'local'} mode)`);
    
    // Keep focus on input field after sending
    inputField.focus();
  }

  // デバッグ用のグローバル関数
  window.__twpp_debug = {
    // WebSocket接続状態の詳細確認
    checkConnectionStatus: function() {
      console.log('🐛 [TWPP-DEBUG] === WebSocket Connection Debug Info ===');
      console.log('🐛 [TWPP-DEBUG] wsClient object:', wsClient);
      console.log('🐛 [TWPP-DEBUG] wsClient.ws:', wsClient?.ws);
      console.log('🐛 [TWPP-DEBUG] readyState:', wsClient?.ws?.readyState);
      console.log('🐛 [TWPP-DEBUG] readyState meanings:');
      console.log('🐛 [TWPP-DEBUG]   0 = CONNECTING');
      console.log('🐛 [TWPP-DEBUG]   1 = OPEN');
      console.log('🐛 [TWPP-DEBUG]   2 = CLOSING');
      console.log('🐛 [TWPP-DEBUG]   3 = CLOSED');
      console.log('🐛 [TWPP-DEBUG] isConnecting flag:', wsClient?.isConnecting);
      console.log('🐛 [TWPP-DEBUG] connectionStatus:', connectionStatus);
      console.log('🐛 [TWPP-DEBUG] currentRoomId:', currentRoomId);
      console.log('🐛 [TWPP-DEBUG] wsClient.roomId:', wsClient?.roomId);
      console.log('🐛 [TWPP-DEBUG] wsClient.userId:', wsClient?.userId);
      console.log('🐛 [TWPP-DEBUG] isConnected() result:', wsClient?.isConnected());
      console.log('🐛 [TWPP-DEBUG] ==============================================');
      
      return {
        wsClient: !!wsClient,
        hasWebSocket: !!wsClient?.ws,
        readyState: wsClient?.ws?.readyState,
        isConnecting: wsClient?.isConnecting,
        connectionStatus,
        currentRoomId,
        wsClientRoomId: wsClient?.roomId,
        userId: wsClient?.userId,
        isConnected: wsClient?.isConnected()
      };
    },
    
    // メッセージ送信テスト
    testMessage: function(text = 'Debug test message') {
      console.log('🐛 [TWPP-DEBUG] Testing message send:', text);
      if (wsClient) {
        return wsClient.sendMessage(text);
      } else {
        console.error('🐛 [TWPP-DEBUG] No wsClient available');
        return false;
      }
    },
    
    // 強制的にWebSocket接続を試行
    forceConnect: function(roomId) {
      const targetRoomId = roomId || currentRoomId;
      console.log('🐛 [TWPP-DEBUG] Force connecting to room:', targetRoomId);
      if (!targetRoomId) {
        console.error('🐛 [TWPP-DEBUG] No room ID available');
        return false;
      }
      wsClient.connect(targetRoomId);
      return true;
    },
    
    // 接続状態をリセット
    resetConnection: function() {
      console.log('🐛 [TWPP-DEBUG] Resetting WebSocket connection');
      wsClient.disconnect();
      setTimeout(() => {
        if (currentRoomId) {
          wsClient.connect(currentRoomId);
        }
      }, 1000);
    },
    
    // サーバー接続テスト
    testServerConnection: async function() {
      console.log('🐛 [TWPP-DEBUG] Testing server connection...');
      try {
        // APIエンドポイントのテスト
        const apiUrl = WS_CONFIG.BASE_URL.replace('wss:', 'https:');
        console.log('🐛 [TWPP-DEBUG] API URL:', apiUrl);
        
        // ヘルスチェック（存在する場合）
        try {
          const healthResponse = await fetch(`${apiUrl}/health`);
          console.log('🐛 [TWPP-DEBUG] Health check:', healthResponse.status);
        } catch (e) {
          console.log('🐛 [TWPP-DEBUG] No health endpoint available');
        }
        
        // ルーム一覧エンドポイントのテスト
        const roomsResponse = await fetch(`${apiUrl}/api/rooms`);
        console.log('🐛 [TWPP-DEBUG] Rooms API status:', roomsResponse.status);
        
        if (roomsResponse.ok) {
          const roomsData = await roomsResponse.json();
          console.log('🐛 [TWPP-DEBUG] Rooms API response:', roomsData);
        }
        
        return {
          server: 'accessible',
          apiUrl,
          roomsApiStatus: roomsResponse.status
        };
      } catch (error) {
        console.error('🐛 [TWPP-DEBUG] Server connection test failed:', error);
        return {
          server: 'error',
          error: error.message
        };
      }
    },
    
    // WebSocketメッセージ履歴の記録開始
    startMessageLogging: function() {
      if (!window.__twpp_messageHistory) {
        window.__twpp_messageHistory = [];
        console.log('🐛 [TWPP-DEBUG] Message logging started');
      }
      
      // 既存のWebSocketイベントを拡張してメッセージを記録
      const originalSend = wsClient?.ws?.send;
      if (originalSend) {
        wsClient.ws.send = function(data) {
          window.__twpp_messageHistory.push({
            direction: 'sent',
            timestamp: new Date().toISOString(),
            data: data
          });
          return originalSend.call(this, data);
        };
      }
    },
    
    // メッセージ履歴の確認
    getMessageHistory: function() {
      return window.__twpp_messageHistory || [];
    },
    
    // メッセージ履歴のクリア
    clearMessageHistory: function() {
      window.__twpp_messageHistory = [];
      console.log('🐛 [TWPP-DEBUG] Message history cleared');
    },
    
    // 総合デバッグレポート
    getFullReport: async function() {
      const connectionStatus = this.checkConnectionStatus();
      const serverTest = await this.testServerConnection();
      const messageHistory = this.getMessageHistory();
      
      const report = {
        timestamp: new Date().toISOString(),
        connection: connectionStatus,
        server: serverTest,
        messageHistory: {
          count: messageHistory.length,
          recent: messageHistory.slice(-5) // 最新5件
        },
        recommendations: []
      };
      
      // 推奨事項の生成
      if (!connectionStatus.isConnected && connectionStatus.currentRoomId) {
        report.recommendations.push('WebSocketが切断されています。ルームに再参加してください。');
      }
      
      if (serverTest.server === 'error') {
        report.recommendations.push('サーバーへの接続に問題があります。ネットワーク接続を確認してください。');
      }
      
      if (messageHistory.length === 0) {
        report.recommendations.push('メッセージ履歴がありません。メッセージ送信テストを実行してください。');
      }
      
      console.log('🐛 [TWPP-DEBUG] === FULL DEBUG REPORT ===');
      console.log(report);
      console.log('🐛 [TWPP-DEBUG] ================================');
      
      return report;
    }
  };

  function startCountdown() {
    const countdownButton = shadowRoot.getElementById('countdown-button');
    if (!countdownButton) return;

    // ボタンを無効化
    countdownButton.disabled = true;
    countdownButton.textContent = 'カウントダウン中...';
    countdownButton.style.opacity = '0.6';
    countdownButton.style.cursor = 'not-allowed';

    const countdownMessages = ['5', '4', '3', '2', '1', '再生！'];
    let currentIndex = 0;

    const countdownInterval = setInterval(() => {
      if (currentIndex >= countdownMessages.length) {
        clearInterval(countdownInterval);

        // ボタンを再有効化してタイマーを開始
        countdownButton.disabled = false;
        countdownButton.style.opacity = '1';
        countdownButton.style.cursor = 'pointer';

        // タイマーを開始
        startTimer();
        return;
      }

      const message = {
        ts: formatTime(),
        text: countdownMessages[currentIndex],
      };

      messages.push(message);
      renderMessages();
      saveToStorage();

      currentIndex++;
    }, 1000);
  }

  function formatTimerDisplay(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  function createEditableTimerDisplay(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `<span id="timer-hours" class="timer-segment" data-unit="hours">${hours.toString().padStart(2, '0')}</span>:<span id="timer-minutes" class="timer-segment" data-unit="minutes">${minutes.toString().padStart(2, '0')}</span>:<span id="timer-seconds" class="timer-segment" data-unit="seconds">${seconds.toString().padStart(2, '0')}</span>`;
  }

  function updateTimerDisplay() {
    const timerDisplay = shadowRoot.getElementById('timer-display');
    if (!timerDisplay || !isTimerRunning || !timerStartTime) return;

    const currentTime = Date.now();
    const elapsedSeconds = Math.floor((currentTime - timerStartTime) / 1000) + timerOffset;
    timerDisplay.textContent = formatTimerDisplay(elapsedSeconds);
  }

  function adjustTimerValue(unit, change) {
    // 現在の総秒数を取得
    let totalSeconds = timerOffset;
    
    // 単位ごとに値を調整
    if (unit === 'seconds') {
      totalSeconds += change;
    } else if (unit === 'minutes') {
      totalSeconds += change * 60;
    } else if (unit === 'hours') {
      totalSeconds += change * 3600;
    }
    
    // 負の値を防ぐ
    if (totalSeconds < 0) {
      totalSeconds = 0;
    }
    
    // 新しいtimerOffsetを設定
    timerOffset = totalSeconds;
    
    // 表示を更新
    updateEditableTimerDisplay();
    
    // ストレージに保存
    saveToStorage();
  }

  function updateEditableTimerDisplay() {
    const timerDisplay = shadowRoot.getElementById('timer-display');
    if (!timerDisplay || isTimerRunning) return;

    // 編集可能な表示に更新
    timerDisplay.innerHTML = createEditableTimerDisplay(timerOffset);
    setupTimerEditHandlers();
  }

  function setupTimerEditHandlers() {
    const segments = shadowRoot.querySelectorAll('.timer-segment');
    
    segments.forEach(segment => {
      // Remove any existing event listeners to prevent duplicates
      segment.replaceWith(segment.cloneNode(true));
    });
    
    // Re-select after cloning
    const newSegments = shadowRoot.querySelectorAll('.timer-segment');
    
    newSegments.forEach(segment => {
      segment.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const unit = segment.dataset.unit;
        const increment = e.deltaY < 0 ? 1 : -1;
        const multiplier = e.shiftKey ? 10 : 1;
        
        adjustTimerValue(unit, increment * multiplier);
      }, { passive: false });
    });
  }

  function setupTimerEventListeners() {
    const pauseButton = shadowRoot.getElementById('pause-button');
    const resetButton = shadowRoot.getElementById('reset-button');

    if (pauseButton) {
      pauseButton.addEventListener('click', () => {
        if (isTimerRunning) {
          // 一時停止
          const currentTime = Date.now();
          const elapsedSeconds = Math.floor((currentTime - timerStartTime) / 1000) + timerOffset;
          timerOffset = elapsedSeconds;

          stopTimer();
          pauseButton.textContent = '▶';
          pauseButton.style.opacity = '0.7';
          
          // 編集可能モードに切り替え
          updateEditableTimerDisplay();
        } else {
          // 再開
          timerStartTime = Date.now();
          isTimerRunning = true;
          timerInterval = setInterval(updateTimerDisplay, 1000);
          updateTimerDisplay();

          pauseButton.textContent = '⏸';
          pauseButton.style.opacity = '1';
          saveToStorage();
        }
      });
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        // 完全リセット
        resetTimerCompletely();
      });
    }
  }

  function resetTimerCompletely() {
    // タイマー停止
    stopTimer();

    // タイマー状態をリセット
    timerStartTime = null;
    timerOffset = 0;
    isTimerRunning = false;

    // ストレージからタイマー情報を削除
    chrome.storage.local.remove([STORAGE_KEYS.timerStartTime, STORAGE_KEYS.timerOffset]);

    // ヘッダーを元の「カウントダウン」ボタンに戻す
    const header = shadowRoot.getElementById('header');
    if (header) {
      header.innerHTML = `
        <button id="countdown-button" style="
          width: 100%;
          padding: 8px 12px;
          background: rgba(59, 130, 246, 0.3);
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(59, 130, 246, 0.6);
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          text-shadow: 0 0 4px rgba(0, 0, 0, 1);
          transition: all 0.2s ease;
        ">カウントダウン</button>
      `;

      // カウントダウンボタンのイベントリスナーを再設定
      const countdownButton = shadowRoot.getElementById('countdown-button');
      if (countdownButton) {
        countdownButton.addEventListener('click', startCountdown);
      }
    }
  }

  function startTimer() {
    if (isTimerRunning) return;

    const header = shadowRoot.getElementById('header');
    if (!header) return;

    timerStartTime = Date.now();
    isTimerRunning = true;

    // ヘッダーUIを3つのコンポーネントに変更
    header.innerHTML = `
      <div id="timer-controls" style="
        display: flex; 
        gap: 8px; 
        align-items: center;
        width: 100%;
      ">
        <div id="timer-display" style="
          flex: 1;
          font-family: monospace, -apple-system, BlinkMacSystemFont;
          font-size: 16px;
          font-weight: bold;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 0 0 4px rgba(0, 0, 0, 1);
          text-align: left;
        ">00:00:00</div>
        <button id="pause-button" style="
          width: 40px;
          height: 32px;
          background: rgba(59, 130, 246, 0.3);
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(59, 130, 246, 0.6);
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          text-shadow: 0 0 4px rgba(0, 0, 0, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        ">⏸</button>
        <button id="reset-button" style="
          width: 40px;
          height: 32px;
          background: rgba(239, 68, 68, 0.3);
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(239, 68, 68, 0.6);
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          text-shadow: 0 0 4px rgba(0, 0, 0, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        ">↺</button>
      </div>
    `;

    // イベントリスナーを再設定
    setupTimerEventListeners();

    // タイマーを開始
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();

    saveToStorage();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning = false;
    saveToStorage();
  }

  function toggleSidebar() {
    isVisible = !isVisible;

    if (isVisible) {
      sidebarContainer.style.display = 'block';
    } else {
      sidebarContainer.style.display = 'none';
    }

    saveToStorage();
  }

  function applySidebarVisibility() {
    if (isVisible) {
      sidebarContainer.style.display = 'block';
    } else {
      sidebarContainer.style.display = 'none';
    }
  }

  async function initialize() {
    await loadFromStorage();
    createSidebar();

    // Initialize opacity slider with saved value
    const opacitySlider = shadowRoot.getElementById('opacity-slider');
    if (opacitySlider) {
      opacitySlider.value = backgroundOpacity;
    }

    renderMessages();
    applySidebarVisibility();

    // Restore room state if available
    if (currentRoomId) {
      displayRoomId(currentRoomId);
      addSystemMessage(`前回のルーム ${currentRoomId} の状態を復元しました`);
      
      // Auto-reconnect to room (optional - could be made configurable)
      setTimeout(() => {
        if (currentRoomId) {
          addSystemMessage('WebSocketに再接続中...');
          wsClient.connect(currentRoomId);
        }
      }, 1000);
    }

    // Apply initial background opacity
    setTimeout(() => {
      updateBackgroundOpacity();
    }, 100);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TWPP_TOGGLE') {
      toggleSidebar();
      sendResponse({ success: true });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
