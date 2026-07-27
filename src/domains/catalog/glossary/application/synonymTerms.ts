import type { Headers } from '@/shared/services/http'
import { glossaryApi } from '../api'

export async function appendGlossaryTermSynonyms(
  headers: Headers,
  glossaryId: string,
  termId: string,
  newSynonyms: string[],
): Promise<number> {
  const term = await glossaryApi.getTerm(headers, glossaryId, termId)
  const existingSynonyms = term.synonyms || []
  const dedupedNewSynonyms = newSynonyms.filter((synonym, index, collection) => {
    const normalized = synonym.trim().toLowerCase()
    if (!normalized) return false
    return collection.findIndex(
      item => item.trim().toLowerCase() === normalized,
    ) === index
  })
  const mergedSynonyms = [
    ...existingSynonyms,
    ...dedupedNewSynonyms.filter(synonym =>
      !existingSynonyms.some(existing =>
        existing.toLowerCase() === synonym.toLowerCase(),
      ),
    ),
  ]
  await glossaryApi.updateTerm(headers, glossaryId, termId, {
    synonyms: mergedSynonyms,
  })
  return mergedSynonyms.length - existingSynonyms.length
}
