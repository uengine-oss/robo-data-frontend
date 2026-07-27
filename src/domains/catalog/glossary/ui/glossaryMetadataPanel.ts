export type MetadataSectionKey = 'domains' | 'owners' | 'reviewers' | 'tags'

type MetadataValue =
  | string
  | {
      id?: string
      name?: string
      color?: string
    }
  | null
  | undefined

export interface MetadataTermLike {
  domains?: MetadataValue[]
  owners?: MetadataValue[]
  reviewers?: MetadataValue[]
  tags?: MetadataValue[]
}

export interface MetadataSectionItem {
  id: string
  label: string
  color?: string
}

export interface MetadataSection {
  key: MetadataSectionKey
  title: string
  emptyText: string
  items: MetadataSectionItem[]
}

const sectionDefinitions: Array<Pick<MetadataSection, 'key' | 'title' | 'emptyText'>> = [
  { key: 'domains', title: '도메인들', emptyText: '도메인들 없음' },
  { key: 'owners', title: '소유자들', emptyText: '소유자들 없음' },
  { key: 'reviewers', title: '검토자들', emptyText: '검토자들 없음' },
  { key: 'tags', title: '태그들', emptyText: '태그들 없음' }
]

const normalizeMetadataItems = (items: MetadataValue[] | undefined): MetadataSectionItem[] => {
  if (!Array.isArray(items)) return []

  const normalized: MetadataSectionItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (typeof item === 'string') {
      const label = item.trim()
      if (!label || seen.has(label)) continue

      seen.add(label)
      normalized.push({ id: label, label })
      continue
    }

    if (!item || typeof item !== 'object') continue

    const label = typeof item.name === 'string' ? item.name.trim() : ''
    if (!label || seen.has(label)) continue

    seen.add(label)
    normalized.push({
      id: typeof item.id === 'string' && item.id ? item.id : label,
      label,
      color: typeof item.color === 'string' && item.color ? item.color : undefined
    })
  }

  return normalized
}

export const buildMetadataSections = (term: MetadataTermLike | null): MetadataSection[] =>
  sectionDefinitions.map(section => ({
    ...section,
    items: normalizeMetadataItems(term?.[section.key])
  }))
