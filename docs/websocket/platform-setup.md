# プラットフォーム設定手順書

## 前提条件
- Cloudflareアカウント（無料）
- Node.js 18以上
- npm または pnpm
- Git

## 1. Cloudflare初期設定

### 1.1 アカウント作成
1. https://cloudflare.com にアクセス
2. 「Sign Up」から無料アカウント作成
3. メール認証を完了
4. ダッシュボードにログイン確認

### 1.2 Wrangler CLI インストール
```bash
# グローバルインストール
npm install -g wrangler

# インストール確認
wrangler --version

# Cloudflareアカウントにログイン
wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログインして認証を完了してください。

### 1.3 プロジェクト初期化
```bash
# サーバー用ディレクトリ作成
mkdir tiny-watch-party-server
cd tiny-watch-party-server

# package.json初期化
npm init -y

# Wranglerプロジェクト初期化
wrangler init --name tiny-watch-party
```

## 2. Durable Objects 設定

### 2.1 wrangler.toml 設定
プロジェクトルートに `wrangler.toml` を作成：

```toml
name = "tiny-watch-party"
main = "src/index.js"
compatibility_date = "2024-01-01"
node_compat = true

# Durable Objects設定
[[durable_objects.bindings]]
name = "ROOMS"
class_name = "ChatRoom"

# マイグレーション設定
[[migrations]]
tag = "v1"
new_classes = ["ChatRoom"]

# 環境変数（ローカル開発用）
[vars]
ENVIRONMENT = "development"
```

### 2.2 Durable Objects 有効化
```bash
# プロジェクトをCloudflareにデプロイ（初回）
wrangler deploy

# Durable Objectsの状態確認
wrangler dev --local=false
```

初回デプロイでDurable Objectsが自動的に有効化されます。

## 3. Cloudflare D1 データベース設定

### 3.1 データベース作成
```bash
# D1データベースを作成
wrangler d1 create tiny-watch-party-db
```

実行後、以下のような出力が表示されます：
```
✅ Successfully created DB 'tiny-watch-party-db' in region APAC
Created your database using D1's new storage backend.

[[d1_databases]]
binding = "DB"
database_name = "tiny-watch-party-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3.2 wrangler.toml に D1 設定追加
上記の出力をコピーして `wrangler.toml` に追加：

```toml
# ... 既存の設定 ...

[[d1_databases]]
binding = "DB"
database_name = "tiny-watch-party-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 実際のIDに置き換え
```

### 3.3 データベーススキーマ作成
`schema.sql` ファイルを作成：

```sql
-- ルーム管理テーブル
CREATE TABLE IF NOT EXISTS rooms (
    room_key TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    host_id TEXT NOT NULL,
    participant_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    closed_reason TEXT,
    last_activity INTEGER NOT NULL
);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    message_type TEXT DEFAULT 'message',
    FOREIGN KEY (room_key) REFERENCES rooms(room_key)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_room_status ON rooms(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_room_messages ON messages(room_key, created_at);
CREATE INDEX IF NOT EXISTS idx_message_expiry ON messages(created_at);
```

### 3.4 スキーマ適用
```bash
# ローカル開発環境に適用
wrangler d1 execute tiny-watch-party-db --local --file=./schema.sql

# 本番環境に適用
wrangler d1 execute tiny-watch-party-db --file=./schema.sql
```

## 4. 環境変数設定

### 4.1 開発環境設定 (.dev.vars)
プロジェクトルートに `.dev.vars` ファイルを作成：

```env
# 開発環境用設定
ENVIRONMENT=development
MAX_ROOM_DURATION=10800000     # 3時間（ミリ秒）
IDLE_TIMEOUT=300000            # 5分（ミリ秒）
HEARTBEAT_INTERVAL=30000       # 30秒（ミリ秒）
MAX_PARTICIPANTS_PER_ROOM=20   # 最大参加者数
MESSAGE_RATE_LIMIT=5000        # メッセージ送信間隔（ミリ秒）
```

### 4.2 本番環境設定
Cloudflareダッシュボードで設定：

1. Workers & Pages にアクセス
2. 作成したWorkerを選択
3. 「Settings」→「Environment Variables」
4. 以下の変数を追加：

| 変数名 | 値 | 暗号化 |
|--------|------|---------|
| `ENVIRONMENT` | `production` | No |
| `MAX_ROOM_DURATION` | `10800000` | No |
| `IDLE_TIMEOUT` | `300000` | No |
| `HEARTBEAT_INTERVAL` | `30000` | No |
| `MAX_PARTICIPANTS_PER_ROOM` | `20` | No |
| `MESSAGE_RATE_LIMIT` | `5000` | No |

## 5. ドメイン設定

### 5.1 Workers.dev ドメイン（デフォルト）
デフォルトでは以下のドメインが使用されます：
```
https://tiny-watch-party.[your-account].workers.dev
wss://tiny-watch-party.[your-account].workers.dev
```

### 5.2 カスタムドメイン設定（オプション）
独自ドメインを使用する場合：

```bash
# ドメイン追加（要Cloudflareプランアップグレード）
wrangler domains add watch.yourdomain.com
```

## 6. モニタリングとログ設定

### 6.1 リアルタイムログ確認
```bash
# 開発中のログ確認
wrangler dev --local=false

# 本番環境のログ確認
wrangler tail
```

### 6.2 Cloudflare Analytics有効化
1. Cloudflareダッシュボード
2. Workers & Pages → Analytics
3. 「Enable Analytics」をクリック

### 6.3 使用量アラート設定
1. Cloudflareダッシュボード
2. 右上のアカウント設定
3. 「Billing」→「Usage」
4. 必要に応じてアラートを設定

## 7. デプロイメント

### 7.1 開発環境での動作確認
```bash
# ローカル開発サーバー起動
wrangler dev --local=false

# 別ターミナルで動作確認
curl https://localhost:8787/health
```

### 7.2 本番環境デプロイ
```bash
# 本番環境にデプロイ
wrangler deploy

# デプロイ状態確認
wrangler status
```

### 7.3 デプロイ確認
```bash
# ヘルスチェック
curl https://tiny-watch-party.[your-account].workers.dev/health

# WebSocket接続テスト（ブラウザコンソールで）
const ws = new WebSocket('wss://tiny-watch-party.[your-account].workers.dev/room/TESTTEST01');
ws.onopen = () => console.log('Connected');
```

## 8. トラブルシューティング

### 8.1 よくある問題

**Q: Durable Objectsが認識されない**
```bash
# マイグレーションを再実行
wrangler deploy --compatibility-date=2024-01-01
```

**Q: D1データベースに接続できない**
```bash
# データベース一覧確認
wrangler d1 list

# データベース情報確認
wrangler d1 info tiny-watch-party-db
```

**Q: WebSocket接続が失敗する**
- ブラウザのセキュリティ設定確認
- Mixed Contentエラーの確認（HTTP/HTTPS混在）
- Cloudflareのプロキシ設定確認

### 8.2 ログ確認方法
```bash
# リアルタイムログ
wrangler tail --format pretty

# エラーログのみ
wrangler tail --format pretty | grep ERROR
```

### 8.3 リセット手順
問題が解決しない場合の完全リセット：

```bash
# Workerを削除
wrangler delete tiny-watch-party

# D1データベースを削除
wrangler d1 delete tiny-watch-party-db

# 再度セットアップ実行
```

## 9. 料金とリソース管理

### 9.1 無料枠の制限
- **Workers**: 100,000リクエスト/日
- **Durable Objects**: 1,000,000リクエスト/月
- **D1**: 5GB、100,000,000読み取り/日、5,000,000書き込み/日
- **WebSocket**: 接続時間による課金なし（2024年時点）

### 9.2 使用量監視
```bash
# 使用量確認
wrangler metrics

# ダッシュボードで詳細確認
# https://dash.cloudflare.com → Workers & Pages → Analytics
```

### 9.3 コスト最適化
- TTL設定でデータベース容量削減
- 無人時の自動終了で計算時間削減
- メッセージ数制限でリクエスト数制御

## 10. セキュリティ設定

### 10.1 CORS設定
`wrangler.toml` に追加：
```toml
[env.production.vars]
ALLOWED_ORIGINS = "https://youtube.com,https://www.youtube.com,https://twitch.tv,https://www.twitch.tv"
```

### 10.2 レート制限
環境変数で制御：
```
MESSAGE_RATE_LIMIT=5000    # 5秒間隔
ROOM_CREATION_LIMIT=60000  # 1分間隔
```

---

## 次のステップ
設定が完了したら、次は実装を開始します：
1. `use-case-implementation.md` を参考に実装計画を確認
2. Chrome拡張機能側の実装開始
3. サーバー側のWebSocket実装開始