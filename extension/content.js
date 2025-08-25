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
      <div id="sidebar" style="
        position: fixed;
        top: 0;
        right: 0;
        width: 360px;
        height: 100vh;
        background: #ffffff;
        border-left: 1px solid #e0e0e0;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
      ">
        <div id="header" style="
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
          background: #f8f9fa;
          font-weight: bold;
          color: #333;
        ">
          Tiny Watch Party
        </div>
        
        <div id="messages-container" style="
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        "></div>
        
        <div id="input-container" style="
          padding: 12px;
          border-top: 1px solid #e0e0e0;
          background: #f8f9fa;
        ">
          <div style="display: flex; gap: 8px;">
            <input type="text" id="message-input" placeholder="メッセージを入力..." style="
              flex: 1;
              padding: 8px 12px;
              border: 1px solid #ccc;
              border-radius: 4px;
              font-size: 14px;
            ">
            <button id="send-button" style="
              padding: 8px 16px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">送信</button>
          </div>
        </div>
        
        <div id="hint" style="
          padding: 8px 12px;
          background: #e9ecef;
          font-size: 12px;
          color: #666;
          text-align: center;
        ">
          Alt+Shift+C または拡張機能アイコンで表示/非表示
        </div>
      </div>
    `;
    
    shadowRoot.innerHTML = sidebarHTML;
    
    messagesList = shadowRoot.getElementById('messages-container');
    inputField = shadowRoot.getElementById('message-input');
    const sendButton = shadowRoot.getElementById('send-button');
    
    inputField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
    
    sendButton.addEventListener('click', sendMessage);
    
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
        background: #f1f3f4;
        border-radius: 8px;
        border-left: 3px solid #007bff;
      `;
      
      messageElement.innerHTML = `
        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
          ${htmlEscape(message.ts)}
        </div>
        <div style="color: #333; line-height: 1.4;">
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