/**
 * clipboard.ts
 * 클립보드 복사 유틸 — 권한 / 비보안 컨텍스트 / 미지원 환경에서도 일관된 폴백.
 *
 * 사용:
 *   const ok = await copyToClipboard('hello')
 *   if (!ok) showToast('복사 실패')
 */

import { logger } from './logger'

/**
 * 텍스트를 시스템 클립보드로 복사한다.
 * 성공 시 true, 실패(권한 거부, 미지원 등) 시 false 반환.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator?.clipboard?.writeText) {
    logger.warn('[clipboard] 브라우저가 clipboard API 를 지원하지 않습니다')
    return false
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    logger.warn('[clipboard] 복사 실패:', e)
    return false
  }
}
