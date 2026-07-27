export interface DisplayableChatMessage {
  type: string
}

export interface ChatMessageWindow<T extends DisplayableChatMessage> {
  visibleMessages: T[]
  hiddenMessageCount: number
}

export function projectChatMessageWindow<T extends DisplayableChatMessage>(
  messages: readonly T[],
  showAll: boolean,
  maxVisibleMessages: number,
): ChatMessageWindow<T> {
  const displayableMessages = messages.filter(
    message => message.type !== 'tool' && message.type !== 'thinking',
  )
  const hiddenMessageCount = showAll
    ? 0
    : Math.max(0, displayableMessages.length - maxVisibleMessages)

  return {
    visibleMessages: hiddenMessageCount > 0
      ? displayableMessages.slice(-maxVisibleMessages)
      : displayableMessages,
    hiddenMessageCount,
  }
}
