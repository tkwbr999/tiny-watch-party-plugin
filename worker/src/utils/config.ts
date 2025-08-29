/**
 * アプリケーション設定定数
 */

export const CONFIG = {
  ROOM: {
    EXPIRY_HOURS: 3,
    MAX_PARTICIPANTS: 10,
    ID_PATTERN: /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  },
  SERVER: {
    DEFAULT_PORT: 3000,
    WRANGLER_PORT: 8787,
    PERFORMANCE_THRESHOLD_MS: 5000
  },
  CHARS: {
    ROOM_ID: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  },
  SECURITY: {
    RATE_LIMIT: {
      MESSAGES_PER_MINUTE: 30,
      CONNECTIONS_PER_MINUTE: 5,
      WINDOW_MS: 60000
    },
    MESSAGE: {
      MAX_LENGTH: 1000,
      MAX_USERNAME_LENGTH: 50,
      MAX_USER_ID_LENGTH: 50,
      MAX_WEBSOCKET_MESSAGE_SIZE: 5000
    },
    TIMESTAMP_TOLERANCE_MS: 60 * 60 * 1000 // 1 hour
  },
  WEBSOCKET: {
    CLOSE_CODES: {
      NORMAL: 1000,
      RATE_LIMITED: 1008,
      INVALID_DATA: 1003
    }
  },
  CORS: {
    ALLOWED_ORIGINS: ['chrome-extension://*', 'http://localhost:*'],
    ALLOWED_HEADERS: ['Content-Type', 'Authorization'],
    ALLOWED_METHODS: ['GET', 'POST', 'OPTIONS']
  }
} as const

export const ENDPOINTS = {
  ROOT: '/',
  HEALTH: '/health',
  STATUS: '/status',
  PERF: '/perf',
  ROOM_CREATE: '/api/rooms/create',
  ROOM_VALIDATE: '/api/rooms/:roomId/validate',
  ROOM_LIST: '/api/rooms',
  WEBSOCKET: '/ws/:roomId'
} as const

export const ERROR_MESSAGES = {
  INVALID_ROOM_ID: 'Invalid room ID format',
  RATE_LIMITED: 'Too many requests, please slow down',
  MESSAGE_TOO_LARGE: 'Message too large',
  INVALID_MESSAGE: 'Invalid message format',
  WEBSOCKET_NOT_SUPPORTED: 'WebSocket not supported in development mode',
  INTERNAL_ERROR: 'Internal Server Error',
  NOT_FOUND: 'The requested endpoint does not exist'
} as const