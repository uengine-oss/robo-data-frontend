import { eventApi, type AlarmPayload } from '@/domains/text2sql/api/events'

export type { AlarmPayload }

export const alarmGateway = {
  stream: (
    onEvent: Parameters<typeof eventApi.streamAlarms>[0],
    signal: AbortSignal,
  ) => eventApi.streamAlarms(onEvent, signal),
  acknowledge: (alarmId: string) => eventApi.acknowledgeNotification(alarmId),
}
