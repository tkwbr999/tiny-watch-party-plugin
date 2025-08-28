/**
 * ルームユーティリティ関数のユニットテスト
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { generateRoomId, generateHostToken, validateRoomId, RuntimeDetector, CONFIG } from '../../src/utils/room'

describe('Room Utilities Unit Tests', () => {
  
  describe('generateRoomId()', () => {
    test('正しいフォーマットのルームIDを生成する', () => {
      const roomId = generateRoomId()
      
      // フォーマットチェック: XXXX-YYYY-ZZZZ
      expect(roomId).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
      
      // 長さチェック
      expect(roomId).toHaveLength(14) // 4+1+4+1+4 = 14文字
      
      // ハイフンの位置チェック
      expect(roomId.charAt(4)).toBe('-')
      expect(roomId.charAt(9)).toBe('-')
    })

    test('複数回実行して全てユニークなIDを生成する', () => {
      const roomIds = new Set<string>()
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        const roomId = generateRoomId()
        roomIds.add(roomId)
      }

      // 全てのIDがユニークであることを確認
      expect(roomIds.size).toBe(iterations)
    })

    test('許可された文字のみ使用する', () => {
      const allowedChars = CONFIG.CHARS.ROOM_ID
      const roomId = generateRoomId()
      
      // ハイフンを除去してチェック
      const cleanId = roomId.replace(/-/g, '')
      
      for (const char of cleanId) {
        expect(allowedChars).toContain(char)
      }
    })

    test('一定回数実行して統計的ランダム性をチェック', () => {
      const charCounts = new Map<string, number>()
      const iterations = 1000
      
      for (let i = 0; i < iterations; i++) {
        const roomId = generateRoomId().replace(/-/g, '')
        for (const char of roomId) {
          charCounts.set(char, (charCounts.get(char) || 0) + 1)
        }
      }
      
      // 各文字が最低1回は出現することを確認（統計的妥当性）
      const totalChars = CONFIG.CHARS.ROOM_ID.length
      const expectedMinOccurrence = Math.floor((iterations * 12) / (totalChars * 10)) // 期待値の1/10以上
      
      for (const char of CONFIG.CHARS.ROOM_ID) {
        const count = charCounts.get(char) || 0
        expect(count).toBeGreaterThan(expectedMinOccurrence)
      }
    })
  })

  describe('generateHostToken()', () => {
    test('正しいフォーマットのホストトークンを生成する', () => {
      const hostToken = generateHostToken()
      
      // host_ プリフィックスを確認
      expect(hostToken).toStartWith('host_')
      
      // 全体の長さチェック (host_ + 8文字 = 13文字、またはUUID形式)
      expect(hostToken.length).toBeGreaterThanOrEqual(13)
    })

    test('複数回実行して全てユニークなトークンを生成する', () => {
      const tokens = new Set<string>()
      const iterations = 50

      for (let i = 0; i < iterations; i++) {
        const token = generateHostToken()
        tokens.add(token)
      }

      // 全てのトークンがユニークであることを確認
      expect(tokens.size).toBe(iterations)
    })

    test('crypto.randomUUID利用時は適切な形式', () => {
      // crypto.randomUUID が利用可能な環境での実行を想定
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        const hostToken = generateHostToken()
        
        // host_ + UUIDの最初のセグメント (8文字)
        expect(hostToken).toMatch(/^host_[a-f0-9]{8}$/)
      }
    })

    test('フォールバック実行時の形式チェック', () => {
      // crypto APIを一時的に無効化してフォールバックをテスト
      const originalCrypto = globalThis.crypto
      // @ts-ignore
      globalThis.crypto = undefined

      const hostToken = generateHostToken()
      
      // host_ プリフィックスを確認
      expect(hostToken).toStartWith('host_')
      expect(hostToken.length).toBeGreaterThanOrEqual(13)

      // 元のcrypto APIを復元
      globalThis.crypto = originalCrypto
    })
  })

  describe('validateRoomId()', () => {
    test('有効なルームIDを正しく検証する', () => {
      const validIds = [
        'A1B2-C3D4-E5F6',
        'ZZZZ-0000-AAAA',
        '9999-BBBB-1111',
        'ABCD-1234-WXYZ'
      ]

      for (const roomId of validIds) {
        expect(validateRoomId(roomId)).toBe(true)
      }
    })

    test('無効なルームIDを正しく拒否する', () => {
      const invalidIds = [
        '', // 空文字
        'ABC-DEF-GHI', // 短すぎる
        'ABCD-EFGH-IJKLM', // 長すぎる
        'abcd-efgh-ijkl', // 小文字
        'A1B2-C3D4-E5F6-G7H8', // セグメントが多すぎる
        'A1B2_C3D4_E5F6', // 区切り文字が違う
        'A1B2-C3D4', // セグメントが足りない
        'A1B2-C3D4-E5F@', // 不正文字
        '日本語-TEST-ABCD' // 非ASCII文字
      ]

      for (const roomId of invalidIds) {
        expect(validateRoomId(roomId)).toBe(false)
      }
    })

    test('生成されたルームIDが検証を通過する', () => {
      // 生成→検証の整合性テスト
      for (let i = 0; i < 20; i++) {
        const roomId = generateRoomId()
        expect(validateRoomId(roomId)).toBe(true)
      }
    })

    test('境界値テスト', () => {
      // 正確に12文字+2ハイフン
      expect(validateRoomId('A1B2-C3D4-E5F6')).toBe(true)
      
      // 1文字足りない/多い
      expect(validateRoomId('A1B2-C3D4-E5F')).toBe(false)
      expect(validateRoomId('A1B2-C3D4-E5F67')).toBe(false)
    })
  })

  describe('RuntimeDetector', () => {
    test('適切なランタイム値を返す', () => {
      expect(['bun', 'cloudflare-workers']).toContain(RuntimeDetector.current)
    })

    test('isBun()メソッドが正しく動作する', () => {
      const isBunResult = RuntimeDetector.isBun()
      expect(typeof isBunResult).toBe('boolean')
      
      // Bunでの実行時はtrueを返すことを確認
      if (typeof Bun !== 'undefined') {
        expect(isBunResult).toBe(true)
      }
    })

    test('isCloudflareWorkers()メソッドが正しく動作する', () => {
      const isCfResult = RuntimeDetector.isCloudflareWorkers()
      expect(typeof isCfResult).toBe('boolean')
      
      // isBun()とisCloudflareWorkers()は排他的
      expect(RuntimeDetector.isBun() && RuntimeDetector.isCloudflareWorkers()).toBe(false)
    })

    test('getPerformanceNote()が適切なメッセージを返す', () => {
      const note = RuntimeDetector.getPerformanceNote()
      expect(typeof note).toBe('string')
      expect(note.length).toBeGreaterThan(0)
      
      // ランタイムに応じたメッセージが含まれることを確認
      if (RuntimeDetector.isBun()) {
        expect(note).toContain('hot reload')
      } else {
        expect(note).toContain('Edge deployment')
      }
    })
  })

  describe('CONFIG constants', () => {
    test('設定値が適切に定義されている', () => {
      // ROOM設定
      expect(CONFIG.ROOM.EXPIRY_HOURS).toBe(3)
      expect(CONFIG.ROOM.MAX_PARTICIPANTS).toBe(10)
      expect(CONFIG.ROOM.ID_PATTERN).toBeInstanceOf(RegExp)
      
      // SERVER設定
      expect(CONFIG.SERVER.DEFAULT_PORT).toBe(3000)
      expect(CONFIG.SERVER.WRANGLER_PORT).toBe(8787)
      expect(CONFIG.SERVER.PERFORMANCE_THRESHOLD_MS).toBe(5000)
      
      // CHARS設定
      expect(CONFIG.CHARS.ROOM_ID).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
      expect(CONFIG.CHARS.ROOM_ID.length).toBe(36) // 26 + 10
    })

    test('ルームID正規表現パターンが正しく動作する', () => {
      expect(CONFIG.ROOM.ID_PATTERN.test('A1B2-C3D4-E5F6')).toBe(true)
      expect(CONFIG.ROOM.ID_PATTERN.test('invalid')).toBe(false)
    })
  })

  describe('Performance Tests', () => {
    test('ルームID生成のパフォーマンス', () => {
      const iterations = 1000
      const startTime = performance.now()
      
      for (let i = 0; i < iterations; i++) {
        generateRoomId()
      }
      
      const endTime = performance.now()
      const avgTime = (endTime - startTime) / iterations
      
      // 1回の生成は1ms未満であるべき
      expect(avgTime).toBeLessThan(1)
    })

    test('ルームID検証のパフォーマンス', () => {
      const iterations = 10000
      const testId = 'A1B2-C3D4-E5F6'
      const startTime = performance.now()
      
      for (let i = 0; i < iterations; i++) {
        validateRoomId(testId)
      }
      
      const endTime = performance.now()
      const avgTime = (endTime - startTime) / iterations
      
      // 1回の検証は0.01ms未満であるべき
      expect(avgTime).toBeLessThan(0.01)
    })
  })

  describe('Edge Cases', () => {
    test('null/undefined値での検証', () => {
      // @ts-ignore - 意図的にnull/undefinedをテスト
      expect(validateRoomId(null)).toBe(false)
      // @ts-ignore
      expect(validateRoomId(undefined)).toBe(false)
    })

    test('空文字・スペースでの検証', () => {
      expect(validateRoomId('')).toBe(false)
      expect(validateRoomId('   ')).toBe(false)
      expect(validateRoomId('\t\n')).toBe(false)
    })

    test('Unicode文字での検証', () => {
      expect(validateRoomId('🎉🎉🎉-🎉🎉🎉-🎉🎉🎉')).toBe(false)
      expect(validateRoomId('ＡＢＣＤ-ＥＦＧＨ-ＩＪＫＬ')).toBe(false) // 全角文字
    })
  })
})