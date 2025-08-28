# WebSocketセキュリティガイドライン

## 更新履歴
- 2024-12-XX: 初版作成、Chrome拡張機能特有のセキュリティリスクを追加

## 1. セキュリティ原則

### 1.1 基本方針
Chrome拡張機能における**WebSocketエンドポイントの露出は避けられない**という前提に基づき、サーバー側での多層防御に重点を置いた設計を行います。

### 1.2 セキュリティレベル
開発段階に応じた段階的なセキュリティ実装を採用します：

| 段階 | 対象者 | セキュリティレベル | 実装内容 |
|------|-------|------------------|----------|
| **開発** | 開発者のみ | 最小限 | 基本的な動作確認のみ |
| **テスト** | 限定ユーザー | 中程度 | IPホワイトリスト or 簡易認証 |
| **本番** | 不特定多数 | 最大限 | 完全な多層防御システム |

## 2. Chrome拡張機能特有のリスク

### 2.1 コード露出リスク
```javascript
// ❌ 問題: エンドポイントURLがコード内で露出
const WS_URL = "wss://tiny-watch-party.workers.dev";

// ✅ 対策: 露出前提での設計
// - サーバー側での厳格な検証
// - 異常パターンの検知と自動遮断
// - 緊急時のURL変更機能
```

### 2.2 環境変数の制約
Chrome拡張機能では以下が不可能です：
- システム環境変数へのアクセス
- ユーザーによる設定ファイル編集
- 外部設定サーバーからの動的取得（初期URL問題）

### 2.3 Service Worker制約
```javascript
// Chrome 116以降の制約
// ✅ 必須実装: 30秒間隔でのkeepAlive
setInterval(() => {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'HEARTBEAT',
      timestamp: Date.now()
    }));
  }
}, 30000);
```

## 3. 多層防御アーキテクチャ

### 3.1 レベル1: エンドポイント層
```javascript
// Cloudflare Workers での実装例
export default {
  async fetch(request, env) {
    // User-Agent検証
    const userAgent = request.headers.get('User-Agent');
    if (!userAgent || !userAgent.includes('Chrome')) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // Origin検証
    const origin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',');
    if (!allowedOrigins.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // IPレート制限（Cloudflare Analytics使用）
    const clientIP = request.headers.get('CF-Connecting-IP');
    if (await isIPBlocked(clientIP, env)) {
      return new Response('Rate Limited', { status: 429 });
    }
    
    return handleWebSocket(request, env);
  }
};
```

### 3.2 レベル2: 認証・認可層
```javascript
// ルームキー検証の強化
class RoomKeyValidator {
  static validate(roomKey) {
    // 基本フォーマット: 12-16文字英数字
    if (!/^[A-Z0-9]{12,16}$/.test(roomKey)) {
      return { valid: false, error: 'INVALID_FORMAT' };
    }
    
    // 辞書攻撃対策: 推測しやすいパターンの排除
    const bannedPatterns = [
      /^(.)\1{11,}$/, // 同一文字の繰り返し
      /^(0123456789|ABCDEFGHIJ|1234567890)/, // 順序パターン
    ];
    
    for (const pattern of bannedPatterns) {
      if (pattern.test(roomKey)) {
        return { valid: false, error: 'WEAK_PATTERN' };
      }
    }
    
    return { valid: true };
  }
  
  // エントロピー確保のための生成
  static generate() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = 12 + Math.floor(Math.random() * 5); // 12-16文字
    
    // crypto.getRandomValues使用（セキュアな乱数）
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    return Array.from(array)
      .map(byte => chars[byte % chars.length])
      .join('');
  }
}
```

### 3.3 レベル3: 異常検知・自動遮断層
```javascript
// 異常パターンの検知
class AnomalyDetector {
  constructor(env) {
    this.env = env;
    this.thresholds = {
      ROOM_CREATION_PER_MINUTE: 5,      // 1分間に5回まで
      INVALID_KEY_ATTEMPTS: 3,          // 3回失敗でIP一時ブロック
      CONNECTIONS_PER_IP: 10,           // 1IPあたり10接続まで
      MESSAGE_RATE_PER_USER: 2000       // 1ユーザー2秒に1回まで
    };
  }
  
  async checkRoomCreationRate(clientIP) {
    const key = `room_creation:${clientIP}`;
    const count = await this.env.KV.get(key) || 0;
    
    if (count >= this.thresholds.ROOM_CREATION_PER_MINUTE) {
      await this.blockIP(clientIP, 'ROOM_CREATION_RATE_LIMIT');
      return false;
    }
    
    await this.env.KV.put(key, count + 1, { expirationTtl: 60 });
    return true;
  }
  
  async checkInvalidKeyAttempts(clientIP) {
    const key = `invalid_attempts:${clientIP}`;
    const attempts = await this.env.KV.get(key) || 0;
    
    if (attempts >= this.thresholds.INVALID_KEY_ATTEMPTS) {
      await this.blockIP(clientIP, 'INVALID_KEY_ATTEMPTS', 300); // 5分間
      return false;
    }
    
    return true;
  }
  
  async blockIP(clientIP, reason, duration = 300) {
    const blockKey = `blocked:${clientIP}`;
    await this.env.KV.put(blockKey, JSON.stringify({
      reason,
      blockedAt: Date.now(),
      expiresAt: Date.now() + (duration * 1000)
    }), { expirationTtl: duration });
    
    // アラート送信（Cloudflare Analytics経由）
    await this.sendAlert('IP_BLOCKED', { clientIP, reason });
  }
}
```

## 4. 緊急時対応システム

### 4.1 キルスイッチ実装
```javascript
// wrangler.toml
[vars]
EMERGENCY_SHUTDOWN = "false"
MAINTENANCE_MODE = "false"
BLOCKED_IPS = ""
ALLOWED_IPS = ""

// Workers での実装
if (env.EMERGENCY_SHUTDOWN === "true") {
  return new Response('Service temporarily unavailable', { 
    status: 503,
    headers: {
      'Retry-After': '3600' // 1時間後に再試行
    }
  });
}
```

### 4.2 URL切り替えシステム
```javascript
// Chrome拡張機能側
const ENDPOINTS = [
  'wss://tiny-watch-party-1.workers.dev',
  'wss://tiny-watch-party-2.workers.dev',
  'wss://tiny-watch-party-3.workers.dev'
];

class WebSocketManager {
  async connect(roomKey) {
    for (let i = 0; i < ENDPOINTS.length; i++) {
      try {
        const ws = new WebSocket(`${ENDPOINTS[i]}/room/${roomKey}`);
        await this.waitForConnection(ws);
        return ws;
      } catch (error) {
        console.log(`Endpoint ${i + 1} failed, trying next...`);
        if (i === ENDPOINTS.length - 1) throw error;
      }
    }
  }
}
```

## 5. モニタリングとアラート

### 5.1 重要メトリクス
```javascript
// 監視すべき指標
const ALERT_THRESHOLDS = {
  // 接続関連
  CONCURRENT_CONNECTIONS: 500,
  NEW_CONNECTIONS_PER_MINUTE: 100,
  FAILED_CONNECTIONS_RATE: 0.1, // 10%以上
  
  // セキュリティ関連
  INVALID_ROOM_KEY_RATE: 0.05, // 5%以上
  BLOCKED_IPS_PER_HOUR: 10,
  SUSPICIOUS_PATTERNS: 5,
  
  // パフォーマンス関連
  MESSAGE_PROCESSING_TIME: 100, // 100ms以上
  MEMORY_USAGE: 128 * 1024 * 1024, // 128MB以上
  CPU_USAGE: 80 // 80%以上
};
```

### 5.2 自動対応アクション
```javascript
class AutoResponse {
  async handleHighTraffic(metrics) {
    if (metrics.connectionsPerSecond > 50) {
      // レート制限を一時的に強化
      await this.updateRateLimit('STRICT');
      await this.sendAlert('HIGH_TRAFFIC', metrics);
    }
  }
  
  async handleSecurityIncident(incident) {
    switch (incident.type) {
      case 'DDOS_DETECTED':
        await this.enableEmergencyMode();
        break;
      case 'MASS_INVALID_KEYS':
        await this.blockSuspiciousIPs(incident.ips);
        break;
      case 'RESOURCE_EXHAUSTION':
        await this.enableMaintenanceMode();
        break;
    }
  }
}
```

## 6. インシデント対応手順

### 6.1 レベル1: 軽微な異常
- **症状**: レート制限の軽微な超過
- **対応**: 自動調整、ログ記録
- **復旧時間**: 即座

### 6.2 レベル2: 中程度の攻撃
- **症状**: 大量の無効リクエスト、DDoS攻撃
- **対応**: IP自動ブロック、レート制限強化
- **復旧時間**: 5-15分

### 6.3 レベル3: 深刻なセキュリティ侵害
- **症状**: サービス全体への影響、データ侵害の可能性
- **対応**: 緊急シャットダウン、手動調査
- **復旧時間**: 数時間から数日

### 6.4 緊急連絡手順
1. **自動検知**: Cloudflare Analytics → Webhook → Slack/Discord
2. **手動確認**: ダッシュボードでの詳細確認
3. **対応決定**: 緊急度に応じた対応レベル選択
4. **実行・監視**: 対応実行後の継続監視

## 7. セキュリティテスト

### 7.1 テストケース
```javascript
// セキュリティテストスイート
describe('WebSocket Security Tests', () => {
  test('レート制限テスト', async () => {
    // 短時間での大量リクエスト
    // 期待結果: 429 Rate Limited
  });
  
  test('無効ルームキーテスト', async () => {
    // 不正なフォーマットのルームキー
    // 期待結果: 403 Forbidden
  });
  
  test('IPブロックテスト', async () => {
    // 3回の無効試行後のアクセス
    // 期待結果: 403 Forbidden (5分間)
  });
});
```

## 8. 定期レビューと改善

### 8.1 月次レビュー項目
- [ ] ブロックされたIPの分析
- [ ] 新たな攻撃パターンの確認
- [ ] レート制限の調整
- [ ] アラートの精度改善

### 8.2 四半期レビュー項目
- [ ] セキュリティポリシーの見直し
- [ ] 新たな脅威への対応
- [ ] パフォーマンスとセキュリティのバランス調整
- [ ] インシデント対応手順の改善

---

## 参考資料

- [Chrome Extension WebSocket Security Best Practices](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)
- [Cloudflare Workers Security Guidelines](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)