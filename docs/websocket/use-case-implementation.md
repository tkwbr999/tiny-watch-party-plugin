# ユースケース実装仕様書

## 更新履歴
- 2024-12-XX: 初版作成

## 1. システム概要

### 1.1 実装方式
- **ルーム管理**: 10桁A-Zルームキー方式
- **接続方式**: WebSocket (Cloudflare Workers + Durable Objects)
- **データ永続化**: Cloudflare D1 Database
- **課金最適化**: 無人時自動終了、TTL設定

### 1.2 主要制約
- **無料枠運用**: Cloudflare無料プランでの運用
- **タイムアウト**: 無人5分、最大3時間で自動終了
- **参加者制限**: Phase 1では制限なし、Phase 2で20名まで

## 2. ユースケース詳細

### UC-001: ホストがルーム作成

**前提条件**:
- Chrome拡張機能がインストール済み
- インターネット接続が安定

**フロー**:
1. ユーザーがサイドバー内「ウォッチパーティーを開始」ボタンをクリック
2. システムが10桁A-Zルームキーを生成 (例: `HKPQWERTYU`)
3. ルームキー重複チェック実行
4. 重複時は再生成、非重複時はルーム情報をD1に保存
5. Durable Objectsインスタンス作成
6. WebSocket接続を確立
7. ルームキーをUI表示、コピーボタン有効化
8. 3時間タイマー開始

**成功条件**:
- ルームキーが正常に生成・表示される
- WebSocket接続が確立される
- タイマーが3:00:00から開始される

**例外処理**:
- ルームキー生成失敗時: 5回まで再試行
- WebSocket接続失敗時: 指数バックオフで再接続
- サーバーエラー時: エラーメッセージ表示

```javascript
// ルーム作成実装例
async function createRoom() {
  try {
    const roomKey = generateRoomKey(); // 10桁A-Z生成
    const response = await fetch(`${SERVER_URL}/room/${roomKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostId: getUserId(),
        maxDuration: 10800000, // 3時間
        createdAt: Date.now()
      })
    });
    
    if (response.ok) {
      connectWebSocket(roomKey);
      displayRoomKey(roomKey);
      startTimer(10800); // 3時間 = 10800秒
    }
  } catch (error) {
    showError('ルーム作成に失敗しました');
  }
}
```

### UC-002: ゲストがルーム参加

**前提条件**:
- 有効なルームキーを取得済み
- ルームが存在し、有効期限内

**フロー**:
1. ユーザーがルームキー入力欄に10桁コード入力
2. 入力バリデーション実行 (A-Z, 10桁チェック)
3. 「参加」ボタンクリック
4. サーバーでルーム存在・有効性確認
5. WebSocket接続確立
6. 参加者カウント更新
7. 既存参加者に参加通知送信
8. 過去ログ取得・表示

**成功条件**:
- ルームに正常参加できる
- 過去ログが表示される
- 他の参加者に参加通知される

**例外処理**:
- 無効ルームキー: `E001: 無効なルームキー`
- ルーム不存在: `E003: ルームが存在しない`
- 有効期限切れ: `E004: ルーム有効期限切れ`

```javascript
// ルーム参加実装例
async function joinRoom(roomKey) {
  if (!validateRoomKey(roomKey)) {
    showError('E001: 無効なルームキー');
    return;
  }
  
  try {
    const ws = new WebSocket(`${WS_URL}/room/${roomKey}`);
    
    ws.onopen = () => {
      sendMessage('JOIN', { userId: getUserId(), joinedAt: Date.now() });
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };
    
    ws.onerror = () => {
      showError('接続に失敗しました');
    };
    
  } catch (error) {
    showError('E005: サーバー内部エラー');
  }
}
```

### UC-003: メッセージ送信

**前提条件**:
- ルームに参加済み
- WebSocket接続が活性状態

**フロー**:
1. ユーザーがメッセージを入力欄に記入
2. Ctrl+Enter または Shift+Enter でメッセージ送信
3. レート制限チェック (5秒間隔)
4. メッセージをWebSocketで送信
5. サーバーがメッセージをD1に保存
6. 全参加者にメッセージ配信
7. 送信者にメッセージ表示
8. 最新メッセージまで自動スクロール

**成功条件**:
- メッセージが全参加者に配信される
- タイムスタンプが正確に表示される
- 自動スクロールが機能する

**例外処理**:
- レート制限違反: 送信無効、警告表示
- 接続断: キューに保存、再接続時送信
- 空メッセージ: 送信無効

```javascript
// メッセージ送信実装例
function sendChatMessage(text) {
  if (!text.trim()) return;
  
  const now = Date.now();
  if (now - lastMessageTime < MESSAGE_RATE_LIMIT) {
    showWarning('メッセージ送信間隔が短すぎます');
    return;
  }
  
  const message = {
    type: 'MESSAGE',
    data: {
      text: text.trim(),
      userId: getUserId(),
      timestamp: now
    }
  };
  
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(message));
    lastMessageTime = now;
  } else {
    // オフライン時はキューに保存
    messageQueue.push(message);
  }
}
```

### UC-004: 無人タイムアウト処理

**前提条件**:
- ルームが作成済み
- 全参加者が退出済み

**フロー**:
1. 最後の参加者が退出
2. 参加者カウントが0になる
3. 5分間のアイドルタイマー開始
4. アイドル期間中に新規参加があれば、タイマーリセット
5. 5分経過で自動終了プロセス開始
6. 全データをD1から削除
7. Durable Objectsインスタンス削除
8. ルーム状態を'closed'に更新

**成功条件**:
- 5分間無人でルームが自動終了する
- リソースが適切に解放される
- データが完全に削除される

**例外処理**:
- 削除処理失敗時: 強制削除実行
- タイマー重複時: 既存タイマーキャンセル

```javascript
// アイドルタイムアウト実装例
class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.idleTimer = null;
  }
  
  startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.closeRoom('idle_timeout');
    }, 300000); // 5分
  }
  
  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
  
  async closeRoom(reason) {
    // D1からデータ削除
    await this.env.DB.prepare(
      'UPDATE rooms SET status = ?, closed_reason = ? WHERE room_key = ?'
    ).bind('closed', reason, this.roomKey).run();
    
    // 全接続を終了
    this.broadcastMessage({
      type: 'ROOM_CLOSED',
      data: { reason }
    });
  }
}
```

### UC-005: 最大稼働時間制御

**前提条件**:
- ルーム作成から3時間経過
- ルームが稼働中

**フロー**:
1. ルーム作成から2時間55分でアラート送信
2. 残り5分の警告メッセージを全参加者に送信
3. 3時間経過で強制終了プロセス開始
4. 全参加者に終了通知送信
5. WebSocket接続を全て切断
6. ルームデータをD1から削除
7. Durable Objectsインスタンス削除

**成功条件**:
- 正確に3時間で終了する
- 事前警告が送信される
- データが完全削除される

**例外処理**:
- タイマー不正時: 強制削除実行
- 削除失敗時: 管理者通知

```javascript
// 最大稼働時間制御実装例
class ChatRoom {
  startMaxDurationTimer() {
    // 2時間55分後に警告
    setTimeout(() => {
      this.broadcastMessage({
        type: 'WARNING',
        data: { 
          message: 'ルームは5分後に自動終了します',
          remainingMinutes: 5 
        }
      });
    }, 10500000); // 2時間55分
    
    // 3時間後に強制終了
    setTimeout(() => {
      this.closeRoom('max_duration_reached');
    }, 10800000); // 3時間
  }
}
```

### UC-006: WebSocket再接続処理

**前提条件**:
- 一度WebSocket接続が確立済み
- ネットワーク断などで接続が切断

**フロー**:
1. WebSocket接続断を検知
2. 指数バックオフでの再接続開始
3. 初回: 1秒後再接続試行
4. 失敗時: 2秒, 4秒, 8秒...と間隔を延長
5. 最大60秒まで間隔延長
6. 再接続成功時: 送信キューのメッセージ送信
7. UI状態を最新に同期

**成功条件**:
- 自動的に再接続される
- 未送信メッセージが送信される
- UI状態が正常に復元される

**例外処理**:
- 最大試行回数超過: 手動再接続ボタン表示
- ルーム有効期限切れ: エラー表示
- サーバーエラー: 状況に応じたメッセージ表示

```javascript
// WebSocket再接続実装例
class WebSocketManager {
  constructor(roomKey) {
    this.roomKey = roomKey;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.messageQueue = [];
  }
  
  connect() {
    this.ws = new WebSocket(`${WS_URL}/room/${this.roomKey}`);
    
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
    };
    
    this.ws.onclose = (event) => {
      if (!event.wasClean) {
        this.scheduleReconnect();
      }
    };
  }
  
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showManualReconnectButton();
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

## 3. データベーススキーマ詳細

### 3.1 rooms テーブル
```sql
CREATE TABLE IF NOT EXISTS rooms (
    room_key TEXT PRIMARY KEY,           -- ルームキー (10桁A-Z)
    created_at INTEGER NOT NULL,         -- 作成時刻 (Unix timestamp)
    expires_at INTEGER NOT NULL,         -- 有効期限 (Unix timestamp)
    host_id TEXT NOT NULL,              -- ホストのユーザーID
    participant_count INTEGER DEFAULT 0, -- 現在の参加者数
    status TEXT DEFAULT 'active',        -- active, idle, closed
    closed_reason TEXT,                  -- 終了理由
    last_activity INTEGER NOT NULL       -- 最終活動時刻
);
```

### 3.2 messages テーブル
```sql
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,                 -- メッセージID
    room_key TEXT NOT NULL,              -- ルームキー
    user_id TEXT NOT NULL,               -- 送信者ID
    message TEXT NOT NULL,               -- メッセージ内容
    created_at INTEGER NOT NULL,         -- 送信時刻
    message_type TEXT DEFAULT 'message', -- message, system, notification
    FOREIGN KEY (room_key) REFERENCES rooms(room_key)
);
```

### 3.3 TTL設定による自動削除
```sql
-- 3時間後に自動削除されるトリガー例
CREATE TRIGGER IF NOT EXISTS cleanup_expired_rooms
AFTER INSERT ON rooms
WHEN NEW.expires_at <= strftime('%s', 'now')
BEGIN
  DELETE FROM messages WHERE room_key = NEW.room_key;
  DELETE FROM rooms WHERE room_key = NEW.room_key;
END;
```

## 4. エラーハンドリング仕様

### 4.1 クライアント側エラー処理

| エラーコード | 説明 | UI表示 | 対処方法 |
|------------|------|---------|----------|
| `E001` | 無効なルームキー | "無効なルームキーです" | 正しいキー再入力を促す |
| `E002` | ルーム満室 | "ルームが満室です" | 後で試すよう案内 |
| `E003` | ルーム不存在 | "ルームが存在しません" | キー確認を促す |
| `E004` | 有効期限切れ | "ルームの有効期限が切れています" | 新規ルーム作成を促す |
| `E005` | サーバーエラー | "サーバーエラーが発生しました" | 時間をおいて再試行 |

### 4.2 サーバー側エラー処理

```javascript
// エラーレスポンス統一フォーマット
function createErrorResponse(code, message, details = {}) {
  return new Response(JSON.stringify({
    error: {
      code,
      message,
      details,
      timestamp: Date.now()
    }
  }), {
    status: getStatusCode(code),
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## 5. パフォーマンス最適化

### 5.1 メッセージ送信最適化
- バッチ送信: 100ms以内の複数メッセージを統合
- 圧縮: 長文メッセージのgzip圧縮
- キューイング: 接続断時の自動キューイング

### 5.2 データベース最適化
- インデックス活用: room_key, created_at でのクエリ最適化
- TTL設定: 自動削除でストレージ使用量制御
- バッチ処理: 期限切れデータの定期一括削除

### 5.3 Durable Objects最適化
- アイドル時削除: 無人5分で自動削除
- 状態同期: 必要最小限のデータのみ保持
- イベント最適化: 不要なイベント配信削減

## 6. セキュリティ対策

### 6.1 入力サニタイゼーション
```javascript
function sanitizeMessage(message) {
  // HTMLタグエスケープ
  return message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .substring(0, 500); // 最大500文字
}
```

### 6.2 レート制限実装
```javascript
class RateLimiter {
  constructor(interval = 5000) {
    this.interval = interval;
    this.lastAction = new Map();
  }
  
  canPerformAction(userId, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const lastTime = this.lastAction.get(key) || 0;
    
    if (now - lastTime < this.interval) {
      return false;
    }
    
    this.lastAction.set(key, now);
    return true;
  }
}
```

## 7. モニタリングとログ

### 7.1 重要メトリクス
- 同時接続数
- メッセージ送信レート
- エラー発生率
- 平均ルーム稼働時間
- リソース使用量

### 7.2 ログ出力例
```javascript
function logRoomActivity(roomKey, action, details) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    roomKey,
    action, // create, join, leave, message, close
    details,
    environment: env.ENVIRONMENT
  }));
}
```

## 8. テスト仕様

### 8.1 単体テスト
- ルームキー生成のランダム性テスト
- メッセージサニタイゼーションテスト
- タイムアウト処理テスト

### 8.2 統合テスト
- WebSocket接続・切断テスト
- 複数参加者でのメッセージ送受信テスト
- 異常系での再接続テスト

### 8.3 負荷テスト
- 同時接続数限界テスト
- メッセージ送信レート限界テスト
- 長時間稼働安定性テスト

---

## 9. 実装順序

### Phase 1: 基本機能実装
1. [ ] ルーム作成・参加機能
2. [ ] WebSocket接続管理
3. [ ] メッセージ送受信
4. [ ] 基本的なタイムアウト処理

### Phase 2: 安定性向上
1. [ ] 再接続処理
2. [ ] エラーハンドリング
3. [ ] レート制限
4. [ ] セキュリティ強化

### Phase 3: 最適化・監視
1. [ ] パフォーマンス最適化
2. [ ] モニタリング実装
3. [ ] ログ整備
4. [ ] テスト自動化

## 10. 今後の拡張予定

### 将来機能
- ルーム設定カスタマイズ
- ユーザーニックネーム
- メッセージ削除・編集
- 管理者機能
- 統計・分析機能