/**
 * ヘルスチェック関連ハンドラー
 */

import { HonoContext, HealthResponse, StatusResponse, PerformanceResponse, ServiceInfo } from '../types'
import { RuntimeDetector } from '../utils/room'
import { getCurrentISOTimestamp, generateTestData, filterTestData, measurePerformance } from '../utils/helpers'
import { ENDPOINTS } from '../utils/config'

/**
 * ルートエンドポイントハンドラー
 */
export const rootHandler = (c: HonoContext): Response => {
  const serviceInfo: ServiceInfo = {
    service: 'Tiny Watch Party WebSocket Server',
    runtime: RuntimeDetector.current,
    environment: (c.env as any)?.ENVIRONMENT || 'development',
    timestamp: getCurrentISOTimestamp(),
    endpoints: {
      health: ENDPOINTS.HEALTH,
      status: ENDPOINTS.STATUS,
      perf: ENDPOINTS.PERF,
      roomCreate: ENDPOINTS.ROOM_CREATE,
      roomValidate: '/api/rooms/{roomId}/validate',
      webSocket: '/ws/{roomId}'
    },
    performance: {
      note: RuntimeDetector.getPerformanceNote()
    }
  }

  return c.json(serviceInfo)
}

/**
 * ヘルスチェックハンドラー
 */
export const healthHandler = (c: HonoContext): Response => {
  const healthResponse: HealthResponse = {
    status: 'healthy',
    service: 'tiny-watch-party-worker',
    runtime: RuntimeDetector.current,
    environment: (c.env as any)?.ENVIRONMENT || 'development',
    timestamp: getCurrentISOTimestamp(),
    uptime: Date.now(),
    version: '1.0.0',
    features: {
      webSocket: RuntimeDetector.isCloudflareWorkers() 
        ? '🚧 (Stateless - Single user only)' 
        : '🚧 (CF Workers only)',
      honoFramework: '✅',
      typeScript: '✅',
      cors: '✅',
      performance: '✅',
      roomManagement: '✅'
    },
    limitations: {
      webSocket: 'Current implementation supports single-user connections only. Multi-user chat requires Durable Objects.',
      state: 'Stateless Workers - no shared memory between WebSocket connections'
    }
  }

  return c.json(healthResponse)
}

/**
 * ステータス詳細ハンドラー
 */
export const statusHandler = (c: HonoContext): Response => {
  const url = new URL(c.req.url)

  const statusResponse: StatusResponse = {
    status: 'operational',
    timestamp: getCurrentISOTimestamp(),
    runtime: RuntimeDetector.current,
    environment: (c.env as any)?.ENVIRONMENT || 'development',
    request: {
      method: c.req.method,
      url: url.toString(),
      userAgent: c.req.header('User-Agent') || 'unknown'
    },
    worker: {
      region: (c.req as any).cf?.colo || 'local',
      country: (c.req as any).cf?.country || 'local',
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'localhost'
    },
    performance: {
      runtime: RuntimeDetector.current,
      note: RuntimeDetector.getPerformanceNote()
    }
  }

  return c.json(statusResponse)
}

/**
 * パフォーマンステストハンドラー
 */
export const performanceHandler = async (c: HonoContext): Promise<Response> => {
  const performanceTest = async (): Promise<PerformanceResponse> => {
    // 軽量な処理でパフォーマンステスト
    const data = generateTestData(1000)
    const processed = filterTestData(data)

    return {
      runtime: RuntimeDetector.current,
      processingTime: '0ms', // measurePerformanceで計測される
      dataProcessed: {
        total: data.length,
        filtered: processed.length
      },
      timestamp: getCurrentISOTimestamp()
    }
  }

  const { result, duration } = await measurePerformance(performanceTest)

  // パフォーマンス結果を更新
  result.processingTime = `${duration}ms`

  return c.json(result)
}

/**
 * 404 Not Found ハンドラー
 */
export const notFoundHandler = (c: HonoContext): Response => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
    timestamp: getCurrentISOTimestamp(),
    availableEndpoints: [
      ENDPOINTS.ROOT,
      ENDPOINTS.HEALTH,
      ENDPOINTS.STATUS,
      ENDPOINTS.PERF,
      'POST ' + ENDPOINTS.ROOM_CREATE,
      ENDPOINTS.ROOM_LIST,
      '/api/rooms/{roomId}/validate'
    ]
  }, 404)
}

/**
 * エラーハンドラー
 */
export const errorHandler = (err: Error, c: HonoContext): Response => {
  console.error('Error:', err)
  
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: getCurrentISOTimestamp()
  }, 500)
}