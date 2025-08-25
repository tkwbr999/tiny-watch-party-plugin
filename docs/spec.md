## Tiny Watch Party Chrome Extension — MVP 仕様

### 概要

- **目的**: 任意の Web ページの右側にチャットタイムラインを固定表示し、左側に閲覧中ページを横フルで収める。
- **期間**: 1 時間以内で動作する最小実装（MVP）。

### スコープ

- **含む**: 右サイドバー UI 注入、左側レイアウト確保、表示/非表示トグル、簡易メッセージ投稿・保存。
- **含まない**: 認証、外部サーバ連携、マルチユーザ同期、通知、ルーム機能、デザインの細かい調整。

### 対象/前提

- **プラットフォーム**: Chrome Extension Manifest V3。
- **対象ページ**: `<all_urls>`（全ページ）。一部サイトで CSS 競合が起きる可能性あり。
- **UI 言語**: 日本語（MVP）。

### 依存/権限

- **権限**: `storage`。
- **コマンド**: `Alt+Shift+C` で表示/非表示トグル。
- **アクション**: ツールバーアイコンクリックで表示/非表示トグル。

### UI/UX

- **レイアウト**:
  - **サイドバー**: 右固定、幅 360px、高さ 100vh、`position: fixed`。
  - **ページ側**: `body`に`margin-right: 360px !important;`を適用して重なり回避。
- **サイドバー構成**:
  - **ヘッダ**: タイトル「Tiny Watch Party」。
  - **タイムライン**: 縦スクロール、最新下部、簡易スタイルのメッセージカード。
  - **入力欄**: テキスト入力＋送信ボタン。Enter で送信。
  - **ヒント**: トグル操作説明を下部表示。
- **スタイリング**:
  - **隔離**: Shadow DOM を使用。外部 CSS 衝突を最小化。
  - **Z-index**: 2147483646（DevTools オーバレイより下、通常要素より上）。

### 機能要件（Functional）

- **表示/非表示トグル**:
  - **操作**: ツールバーアイコン、または`Alt+Shift+C`。
  - **状態保持**: `chrome.storage.local`に`visible`を保存。
- **タイムライン表示**:
  - **描画**: DOM でメッセージ配列をレンダリング。末尾へ自動スクロール。
  - **エスケープ**: XSS 回避のためメッセージを HTML エスケープ。
- **メッセージ投稿**:
  - **入力**: Enter または送信ボタン。
  - **保存**: `chrome.storage.local`に追記。
  - **タイムスタンプ**: `HH:MM:SS` 形式を付与。
- **冪等性**:
  - **重複注入防止**: `window.__twpp_injected`フラグで二重注入を避ける。
- **レイアウト確保**:
  - **ページ側**: 表示中のみ`body`へ`margin-right`スタイルを注入/除去。

### 非機能要件（Non-Functional）

- **パフォーマンス**: 初期注入は`document_idle`で実行。軽量 DOM・最低限の再描画。
- **互換性**: 最新 Chrome（MV3）。一部サイトの`overflow`/固定ヘッダとの競合は MVP の割り切り。
- **セキュリティ/プライバシー**: 外部通信なし、`storage`のみ。XSS 対策（エスケープ）。
- **アクセシビリティ**: フォーカス可能な入力とボタン、キーボード送信対応。

### アーキテクチャ

- **構成**:
  - **`background`（Service Worker）**: アクション/コマンド受け取り → アクティブタブにメッセージ送信。
  - **`content_script`**: サイドバー DOM 注入、UI 制御、`storage`との同期。
- **通信**:
  - **メッセージ**: `{ type: "TWPP_TOGGLE" }` を content へ送信。
- **ストレージ**:
  - **キー**:
    - `twpp_visible`: `boolean`
    - `twpp_messages`: `Array<{ ts: string, text: string }>`
- **スタイル隔離**:
  - **Shadow DOM**: サイドバー内部 CSS を独立。
  - **レイアウト用スタイル**: `<style data-twpp="layout">` を`documentElement`直下に付与。

### データモデル

- **Message**:
  - **構造**: `{ ts: string, text: string }`
  - **順序**: 追加順（下に新規表示）。
- **State**:
  - **構造**: `{ visible: boolean, messages: Message[] }`

### 操作フロー

- **初期化**:
  - `content_script`が注入され、ホスト要素＋ Shadow DOM を構築。
  - `storage`から状態取得 → 描画 →`visible`に応じて表示/非表示適用。
- **トグル**:
  - アイコン/ショートカット →`background`がメッセージ →`content_script`が表示状態を反転・保存・再描画。
- **投稿**:
  - 入力 →Enter/クリック → メッセージ保存 → タイムライン再描画 → 末尾スクロール。

### 既知の制約/リスク

- **CSS 競合**: サイト側の`!important`や`overflow`設定によりレイアウト崩れの可能性。
- **固定ヘッダ/フッタ**: サイドバーと重なる場合あり（MVP では対応しない）。
- **Z-index 競合**: まれにサイトの要素がサイドバーより上に来る可能性。

### ディレクトリ構成

- `extension/manifest.json`
- `extension/background.js`
- `extension/content.js`

### 参考設定（抜粋）

```json
{
  "manifest_version": 3,
  "name": "Tiny Watch Party - Sidebar MVP",
  "version": "0.1.0",
  "permissions": ["storage"],
  "action": { "default_title": "Toggle Tiny Watch Party" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }
  ],
  "commands": {
    "toggle-sidebar": {
      "suggested_key": { "default": "Alt+Shift+C" },
      "description": "Toggle Tiny Watch Party Sidebar"
    }
  }
}
```

### 受け入れ条件（Acceptance Criteria）

- **表示**: 任意のページでトグル操作により右サイドバーが表示/非表示できる。
- **レイアウト**: サイドバー表示中、ページ本文がサイドバー幅分だけ左に収まる。
- **投稿**: 入力 →Enter でメッセージがタイムライン末尾に表示・保存される。
- **永続化**: ページを再読み込みしても表示状態とメッセージ履歴が復元される。
- **権限**: `storage`以外の権限を要求しない。

### 手動テスト

- **トグル**: アイコン/`Alt+Shift+C`で表示/非表示が切り替わること。
- **レイアウト**: 表示中に`body`の`margin-right`が 360px になること。
- **投稿**: 複数投稿して降順に表示され、再読み込み後も残ること。
- **冪等性**: 同一ページで二重注入が起きないこと（要素が 1 つだけ）。

### 将来拡張（非 MVP）

- **サイドバー幅のドラッグ可変**
- **ユーザ名/ルーム ID**
- **同期機能（WebSocket/Firestore など）**
- **サイト別レイアウト最適化**
- **ライトテーマ/テーマ切替**
