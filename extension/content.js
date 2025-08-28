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

  const STORAGE_KEYS = {
    visible: 'twpp_visible',
    messages: 'twpp_messages',
    timerStartTime: 'twpp_timer_start',
    timerOffset: 'twpp_timer_offset',
    backgroundOpacity: 'twpp_background_opacity',
    colorTheme: 'twpp_color_theme',
    bgMode: 'twpp_bg_mode',
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

  async function loadFromStorage() {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.visible,
        STORAGE_KEYS.messages,
        STORAGE_KEYS.timerStartTime,
        STORAGE_KEYS.timerOffset,
        STORAGE_KEYS.backgroundOpacity,
        STORAGE_KEYS.colorTheme,
        STORAGE_KEYS.bgMode,
      ]);

      isVisible = result[STORAGE_KEYS.visible] || false;
      messages = result[STORAGE_KEYS.messages] || [];
      backgroundOpacity =
        result[STORAGE_KEYS.backgroundOpacity] !== undefined
          ? result[STORAGE_KEYS.backgroundOpacity]
          : 5;
      
      currentColorTheme = result[STORAGE_KEYS.colorTheme] || 'neon';
      currentBgMode = result[STORAGE_KEYS.bgMode] || 'dark';
      

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
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.visible]: isVisible,
        [STORAGE_KEYS.messages]: messages,
        [STORAGE_KEYS.timerStartTime]: timerStartTime,
        [STORAGE_KEYS.timerOffset]: timerOffset,
        [STORAGE_KEYS.backgroundOpacity]: backgroundOpacity,
        [STORAGE_KEYS.colorTheme]: currentColorTheme,
        [STORAGE_KEYS.bgMode]: currentBgMode,
      });
    } catch (error) {
      console.error('Storage save error:', error);
    }
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

    // Opacity slider event listener
    const opacitySlider = shadowRoot.getElementById('opacity-slider');
    
    opacitySlider.addEventListener('input', (e) => {
      backgroundOpacity = parseInt(e.target.value);
      updateBackgroundOpacity();
      saveToStorage();
    });

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
    if (!messagesList) return;

    messagesList.innerHTML = '';

    messages.forEach((message) => {
      const messageElement = document.createElement('div');
      messageElement.className = 'message-item';
      const messageBg = currentBgMode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
      messageElement.style.cssText = `
        margin-bottom: 8px;
        padding: 8px 12px;
        background: ${messageBg};
        border-radius: 8px;
        border-left: 2px solid ${COLOR_THEMES[currentColorTheme].messageBorder};
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
          ${htmlEscape(message.text)}
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
      console.log(`[TWPP] Keydown: ${e.key}, Ctrl: ${e.ctrlKey}, Meta: ${e.metaKey}, Shift: ${e.shiftKey}, Composing: ${e.isComposing}`);
      
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
      if (videoShortcuts.includes(e.key.toLowerCase())) {
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

  function sendMessage() {
    console.log('[TWPP] sendMessage() called');
    
    if (!inputField) {
      console.log('[TWPP] No input field');
      return;
    }

    const text = inputField.value.trim();
    console.log(`[TWPP] Message text: "${text}"`);
    
    if (!text) {
      console.log('[TWPP] Empty message, not sending');
      return;
    }

    const message = {
      ts: formatTime(),
      text: text
    };

    messages.push(message);
    inputField.value = '';

    renderMessages();
    saveToStorage();
    
    console.log('[TWPP] Message sent successfully');
    
    // Keep focus on input field after sending
    inputField.focus();
  }

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
