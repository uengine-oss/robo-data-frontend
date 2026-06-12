/**
 * logger.ts
 * 환경 분기 로깅 래퍼.
 *
 * - debug/info: DEV 빌드에서만 출력. production 빌드에서는 no-op.
 * - warn/error: 모든 환경에서 출력. (운영 모니터링 도입 시 이 두 함수에 hook)
 * - group/groupEnd: DEV 에서만 그룹화.
 *
 * 사용:
 *   import { logger } from '@/shared/utils/logger'
 *   logger.debug('foo', value)
 *   logger.warn('something off', err)
 */

const IS_DEV = import.meta.env.DEV

type LogArgs = readonly unknown[]

function noop(): void {
  /* production no-op */
}

export const logger = {
  debug: IS_DEV
    ? (...args: LogArgs): void => console.log(...args)
    : noop,

  info: IS_DEV
    ? (...args: LogArgs): void => console.info(...args)
    : noop,

  warn: (...args: LogArgs): void => console.warn(...args),

  error: (...args: LogArgs): void => console.error(...args),

  group: IS_DEV
    ? (label: string): void => console.group(label)
    : noop,

  groupCollapsed: IS_DEV
    ? (label: string): void => console.groupCollapsed(label)
    : noop,

  groupEnd: IS_DEV
    ? (): void => console.groupEnd()
    : noop,
}
