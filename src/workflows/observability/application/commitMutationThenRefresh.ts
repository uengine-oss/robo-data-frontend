export interface MutationRefreshOptions<Item, MutationResult> {
  currentItems: readonly Item[]
  mutate: () => Promise<MutationResult>
  commit: (items: readonly Item[], result: MutationResult) => Item[]
  refresh: () => Promise<Item[]>
  describeRefreshError: (cause: unknown) => string
}

export interface MutationRefreshOutcome<Item> {
  items: Item[]
  refreshError: string | null
}

export async function commitMutationThenRefresh<Item, MutationResult>(
  options: MutationRefreshOptions<Item, MutationResult>,
): Promise<MutationRefreshOutcome<Item>> {
  const result = await options.mutate()
  const committedItems = options.commit(options.currentItems, result)

  try {
    return {
      items: await options.refresh(),
      refreshError: null,
    }
  } catch (cause: unknown) {
    return {
      items: committedItems,
      refreshError: options.describeRefreshError(cause),
    }
  }
}
