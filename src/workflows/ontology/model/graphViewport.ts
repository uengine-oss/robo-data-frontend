export const MAX_ONTOLOGY_AUTO_FIT_ZOOM = 1.5

export function limitOntologyAutoFitZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return 1
  }
  return Math.min(zoom, MAX_ONTOLOGY_AUTO_FIT_ZOOM)
}
