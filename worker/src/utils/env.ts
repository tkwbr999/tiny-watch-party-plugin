/**
 * 🔒 セキュリティ強化: 環境変数管理ユーティリティ
 */

// 環境変数の型定義
interface EnvironmentConfig {
  // 必須の環境変数
  DEV_BASE_URL: string
  WSS_BASE_URL: string
  
  // オプションの環境変数
  TEST_TIMEOUT: number
  TEST_WEBSOCKET_TIMEOUT: number
  TEST_MAX_RETRIES: number
  RATE_LIMIT_ENABLED: boolean
  INPUT_VALIDATION_ENABLED: boolean
  HTML_SANITIZATION_ENABLED: boolean
  NODE_ENV: string
  LOG_LEVEL: string
}

// 環境変数検証エラー
export class EnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvironmentError'
  }
}

// 必須環境変数のリスト
const REQUIRED_ENV_VARS = ['DEV_BASE_URL'] as const

// 環境変数の取得と検証
export function getEnvironmentConfig(): EnvironmentConfig {
  // Bunプラットフォーム固有の環境変数アクセス
  const env = typeof Bun !== 'undefined' ? Bun.env : process.env

  // 必須環境変数のチェック
  for (const varName of REQUIRED_ENV_VARS) {
    if (!env[varName]) {
      throw new EnvironmentError(
        `🚨 Missing required environment variable: ${varName}\n` +
        `Please set it in your .env file. See .env.example for reference.`
      )
    }
  }

  const baseUrl = env.DEV_BASE_URL!
  
  // WebSocket URLの自動生成
  const wsUrl = env.WSS_BASE_URL || convertHttpToWs(baseUrl)

  return {
    DEV_BASE_URL: baseUrl,
    WSS_BASE_URL: wsUrl,
    TEST_TIMEOUT: parseInt(env.TEST_TIMEOUT || '5000'),
    TEST_WEBSOCKET_TIMEOUT: parseInt(env.TEST_WEBSOCKET_TIMEOUT || '3000'),
    TEST_MAX_RETRIES: parseInt(env.TEST_MAX_RETRIES || '3'),
    RATE_LIMIT_ENABLED: env.RATE_LIMIT_ENABLED !== 'false',
    INPUT_VALIDATION_ENABLED: env.INPUT_VALIDATION_ENABLED !== 'false',
    HTML_SANITIZATION_ENABLED: env.HTML_SANITIZATION_ENABLED !== 'false',
    NODE_ENV: env.NODE_ENV || 'development',
    LOG_LEVEL: env.LOG_LEVEL || 'info'
  }
}

// HTTP URL を WebSocket URL に変換
function convertHttpToWs(httpUrl: string): string {
  return httpUrl.replace(/^https?:/, (match) => {
    return match === 'https:' ? 'wss:' : 'ws:'
  })
}

// 環境設定の検証
export function validateEnvironmentConfig(config: EnvironmentConfig): void {
  // URL形式の検証
  try {
    new URL(config.DEV_BASE_URL)
  } catch {
    throw new EnvironmentError(`Invalid DEV_BASE_URL format: ${config.DEV_BASE_URL}`)
  }

  try {
    new URL(config.WSS_BASE_URL)
  } catch {
    throw new EnvironmentError(`Invalid WSS_BASE_URL format: ${config.WSS_BASE_URL}`)
  }

  // WebSocket URLのプロトコル検証
  if (!config.WSS_BASE_URL.startsWith('ws://') && !config.WSS_BASE_URL.startsWith('wss://')) {
    throw new EnvironmentError(`WSS_BASE_URL must start with ws:// or wss://: ${config.WSS_BASE_URL}`)
  }

  // タイムアウト値の検証
  if (config.TEST_TIMEOUT < 1000 || config.TEST_TIMEOUT > 30000) {
    throw new EnvironmentError(`TEST_TIMEOUT must be between 1000-30000ms: ${config.TEST_TIMEOUT}`)
  }

  if (config.TEST_WEBSOCKET_TIMEOUT < 1000 || config.TEST_WEBSOCKET_TIMEOUT > 10000) {
    throw new EnvironmentError(`TEST_WEBSOCKET_TIMEOUT must be between 1000-10000ms: ${config.TEST_WEBSOCKET_TIMEOUT}`)
  }
}

// グローバルな設定インスタンス（遅延初期化）
let _environmentConfig: EnvironmentConfig | null = null

export function getEnvConfig(): EnvironmentConfig {
  if (!_environmentConfig) {
    _environmentConfig = getEnvironmentConfig()
    validateEnvironmentConfig(_environmentConfig)
  }
  return _environmentConfig
}

// 開発・テスト用のヘルパー関数
export function isProduction(): boolean {
  return getEnvConfig().NODE_ENV === 'production'
}

export function isDevelopment(): boolean {
  return getEnvConfig().NODE_ENV === 'development'
}

export function isTestMode(): boolean {
  return getEnvConfig().NODE_ENV === 'test'
}

// セキュリティ機能の有効/無効チェック
export function isRateLimitEnabled(): boolean {
  return getEnvConfig().RATE_LIMIT_ENABLED
}

export function isInputValidationEnabled(): boolean {
  return getEnvConfig().INPUT_VALIDATION_ENABLED
}

export function isHtmlSanitizationEnabled(): boolean {
  return getEnvConfig().HTML_SANITIZATION_ENABLED
}

// 環境設定の表示（デバッグ用）
export function displayEnvironmentInfo(): void {
  const config = getEnvConfig()
  
  console.log('🔧 Environment Configuration:')
  console.log(`  NODE_ENV: ${config.NODE_ENV}`)
  console.log(`  DEV_BASE_URL: ${config.DEV_BASE_URL}`)
  console.log(`  WSS_BASE_URL: ${config.WSS_BASE_URL}`)
  console.log(`  Security Features:`)
  console.log(`    Rate Limiting: ${config.RATE_LIMIT_ENABLED ? '✅' : '❌'}`)
  console.log(`    Input Validation: ${config.INPUT_VALIDATION_ENABLED ? '✅' : '❌'}`)
  console.log(`    HTML Sanitization: ${config.HTML_SANITIZATION_ENABLED ? '✅' : '❌'}`)
  console.log(`  Test Configuration:`)
  console.log(`    Timeout: ${config.TEST_TIMEOUT}ms`)
  console.log(`    WebSocket Timeout: ${config.TEST_WEBSOCKET_TIMEOUT}ms`)
  console.log(`    Max Retries: ${config.TEST_MAX_RETRIES}`)
}