(() => {
  if (window.__twpp_injected) {
    return;
  }
  window.__twpp_injected = true;

  let isVisible = false;
  let messages = [];
  let backgroundOpacity = 5; // Default 5% opacity
  let windowPositionX = null;
  let windowPositionY = null;

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
    positionX: 'twpp_position_x',
    positionY: 'twpp_position_y',
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
        STORAGE_KEYS.positionX,
        STORAGE_KEYS.positionY,
      ]);

      isVisible = result[STORAGE_KEYS.visible] || false;
      messages = result[STORAGE_KEYS.messages] || [];
      backgroundOpacity =
        result[STORAGE_KEYS.backgroundOpacity] !== undefined
          ? result[STORAGE_KEYS.backgroundOpacity]
          : 5;
      
      windowPositionX = result[STORAGE_KEYS.positionX];
      windowPositionY = result[STORAGE_KEYS.positionY];

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
        [STORAGE_KEYS.positionX]: windowPositionX,
        [STORAGE_KEYS.positionY]: windowPositionY,
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
        top: ${windowPositionY || 130}px;
        left: ${windowPositionX || (window.innerWidth - 320)}px;
        width: 300px;
        height: calc(100vh - 280px);
        background: transparent;
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
          <input type="range" id="opacity-slider" min="0" max="100" value="5" style="
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            outline: none;
            -webkit-appearance: none;
            cursor: pointer;
          ">
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
              border: 1px solid rgba(255, 255, 255, 0.3);
              border-radius: 4px;
              font-size: 14px;
              background: rgba(0, 0, 0, 0.1);
              color: rgba(255, 255, 255, 0.95);
            ">
            <button id="send-button" style="
              padding: 8px 16px;
              background: rgba(59, 130, 246, 0.3);
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

  function updateBackgroundOpacity() {
    if (!shadowRoot) return;

    const opacityValue = backgroundOpacity / 100;

    // Update message cards background
    const messageElements = shadowRoot.querySelectorAll('#messages-container > div');
    messageElements.forEach((element) => {
      element.style.background = `rgba(0, 0, 0, ${opacityValue})`;
    });

    // Update input field background
    const messageInput = shadowRoot.getElementById('message-input');
    if (messageInput) {
      messageInput.style.background = `rgba(0, 0, 0, ${opacityValue * 2})`;
    }

    // Update button backgrounds
    const buttons = shadowRoot.querySelectorAll('button');
    buttons.forEach((button) => {
      if (button.id === 'countdown-button' || button.id === 'send-button') {
        const currentBg = button.style.background;
        if (currentBg.includes('59, 130, 246')) {
          button.style.background = `rgba(59, 130, 246, ${0.3 + opacityValue * 0.4})`;
        } else if (currentBg.includes('239, 68, 68')) {
          button.style.background = `rgba(239, 68, 68, ${0.3 + opacityValue * 0.4})`;
        }
      }
    });
  }

  function renderMessages() {
    if (!messagesList) return;

    messagesList.innerHTML = '';

    messages.forEach((message) => {
      const messageElement = document.createElement('div');
      messageElement.style.cssText = `
        margin-bottom: 8px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, ${backgroundOpacity / 100});
        border-radius: 8px;
        border-left: 2px solid rgba(59, 130, 246, 0.5);
      `;

      messageElement.innerHTML = `
        <div style="
          font-size: 12px; 
          color: rgba(255, 255, 255, 0.9); 
          margin-bottom: 4px;
          text-shadow: 
            0 0 5px rgba(0, 0, 0, 1),
            0 0 10px rgba(0, 0, 0, 0.9),
            2px 2px 3px rgba(0, 0, 0, 1);
        ">
          ${htmlEscape(message.ts)}
        </div>
        <div style="
          color: rgba(255, 255, 255, 0.95); 
          line-height: 1.4;
          font-weight: 500;
          text-shadow: 
            0 0 6px rgba(0, 0, 0, 1),
            0 0 15px rgba(0, 0, 0, 0.9),
            3px 3px 5px rgba(0, 0, 0, 1);
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
      
      // 位置をストレージに保存
      saveToStorage();
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
