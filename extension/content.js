(() => {
  if (window.__twpp_injected) {
    return;
  }
  window.__twpp_injected = true;

  let isVisible = false;
  let messages = [];
  
  const STORAGE_KEYS = {
    visible: 'twpp_visible',
    messages: 'twpp_messages'
  };

  let sidebarContainer;
  let shadowRoot;
  let messagesList;
  let inputField;
  let layoutStyle;

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
      const result = await chrome.storage.local.get([STORAGE_KEYS.visible, STORAGE_KEYS.messages]);
      isVisible = result[STORAGE_KEYS.visible] || false;
      messages = result[STORAGE_KEYS.messages] || [];
    } catch (error) {
      console.error('Storage load error:', error);
    }
  }

  async function saveToStorage() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.visible]: isVisible,
        [STORAGE_KEYS.messages]: messages
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
      </style>
      <div id="sidebar" style="
        position: fixed;
        top: 0;
        right: 0;
        width: 360px;
        height: 100vh;
        background: rgba(0, 0, 0, 0.05);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-left: 1px solid rgba(255, 255, 255, 0.2);
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 
          inset 0 0 20px rgba(255, 255, 255, 0.05),
          0 0 40px rgba(0, 0, 0, 0.1);
      ">
        <div id="header" style="
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.1);
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
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            text-shadow: 0 0 2px rgba(0, 0, 0, 0.7);
            transition: all 0.2s ease;
          ">カウントダウン</button>
        </div>
        
        <div id="messages-container" style="
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        "></div>
        
        <div id="input-container" style="
          padding: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        ">
          <div style="display: flex; gap: 8px;">
            <input type="text" id="message-input" placeholder="メッセージを入力..." style="
              flex: 1;
              padding: 8px 12px;
              border: 1px solid rgba(255, 255, 255, 0.3);
              border-radius: 4px;
              font-size: 14px;
              background: rgba(0, 0, 0, 0.2);
              color: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(5px);
              -webkit-backdrop-filter: blur(5px);
            ">
            <button id="send-button" style="
              padding: 8px 16px;
              background: rgba(59, 130, 246, 0.4);
              color: rgba(255, 255, 255, 0.95);
              border: 1px solid rgba(59, 130, 246, 0.6);
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              backdrop-filter: blur(10px);
              -webkit-backdrop-filter: blur(10px);
              text-shadow: 0 0 2px rgba(0, 0, 0, 0.7);
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
    
    inputField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
    
    sendButton.addEventListener('click', sendMessage);
    countdownButton.addEventListener('click', startCountdown);
    
    document.documentElement.appendChild(sidebarContainer);
  }

  function createLayoutStyle() {
    layoutStyle = document.createElement('style');
    layoutStyle.setAttribute('data-twpp', 'layout');
    layoutStyle.textContent = `
      body {
        margin-right: 360px !important;
        transition: margin-right 0.3s ease;
      }
    `;
    document.documentElement.appendChild(layoutStyle);
  }

  function removeLayoutStyle() {
    if (layoutStyle) {
      layoutStyle.remove();
      layoutStyle = null;
    }
  }

  function renderMessages() {
    if (!messagesList) return;
    
    messagesList.innerHTML = '';
    
    messages.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.style.cssText = `
        margin-bottom: 8px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.15);
        border-radius: 8px;
        border-left: 2px solid rgba(59, 130, 246, 0.5);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
      `;
      
      messageElement.innerHTML = `
        <div style="
          font-size: 12px; 
          color: rgba(255, 255, 255, 0.9); 
          margin-bottom: 4px;
          text-shadow: 
            0 0 3px rgba(0, 0, 0, 0.8),
            0 0 8px rgba(0, 0, 0, 0.6),
            1px 1px 2px rgba(0, 0, 0, 0.9);
        ">
          ${htmlEscape(message.ts)}
        </div>
        <div style="
          color: rgba(255, 255, 255, 0.95); 
          line-height: 1.4;
          font-weight: 500;
          text-shadow: 
            0 0 4px rgba(0, 0, 0, 0.9),
            0 0 12px rgba(0, 0, 0, 0.7),
            2px 2px 4px rgba(0, 0, 0, 0.8);
        ">
          ${htmlEscape(message.text)}
        </div>
      `;
      
      messagesList.appendChild(messageElement);
    });
    
    messagesList.scrollTop = messagesList.scrollHeight;
  }

  function sendMessage() {
    if (!inputField) return;
    
    const text = inputField.value.trim();
    if (!text) return;
    
    const message = {
      ts: formatTime(),
      text: text
    };
    
    messages.push(message);
    inputField.value = '';
    
    renderMessages();
    saveToStorage();
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
        
        // ボタンを再有効化
        countdownButton.disabled = false;
        countdownButton.textContent = 'カウントダウン';
        countdownButton.style.opacity = '1';
        countdownButton.style.cursor = 'pointer';
        return;
      }
      
      const message = {
        ts: formatTime(),
        text: countdownMessages[currentIndex]
      };
      
      messages.push(message);
      renderMessages();
      saveToStorage();
      
      currentIndex++;
    }, 1000);
  }

  function toggleSidebar() {
    isVisible = !isVisible;
    
    if (isVisible) {
      sidebarContainer.style.display = 'block';
      createLayoutStyle();
    } else {
      sidebarContainer.style.display = 'none';
      removeLayoutStyle();
    }
    
    saveToStorage();
  }

  function applySidebarVisibility() {
    if (isVisible) {
      sidebarContainer.style.display = 'block';
      createLayoutStyle();
    } else {
      sidebarContainer.style.display = 'none';
    }
  }

  async function initialize() {
    await loadFromStorage();
    createSidebar();
    renderMessages();
    applySidebarVisibility();
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