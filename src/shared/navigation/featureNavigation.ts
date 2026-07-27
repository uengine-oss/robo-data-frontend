import { inject, type InjectionKey, type Ref } from 'vue'

/** Lower layers depend on this port; the app owns and provides its implementation. */
export interface FeatureNavigationPort {
  readonly activeFeatureId: Readonly<Ref<string>>
  open<T>(featureId: string, payload?: T): void
  peek<T>(featureId: string): T | null
  consume<T>(featureId: string): T | null
}

export const FEATURE_NAVIGATION_KEY: InjectionKey<FeatureNavigationPort> = Symbol('feature-navigation')

export function useFeatureNavigation(): FeatureNavigationPort {
  const navigation = inject(FEATURE_NAVIGATION_KEY)
  if (!navigation) throw new Error('Feature navigation provider is not installed')
  return navigation
}
