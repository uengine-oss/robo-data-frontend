/**
 * @deprecated graphStyleStorage.ts로 통합됨. 이 파일은 하위호환용 re-export입니다.
 */
export {
  type StyleConfig as NodeStyleConfig,
  type StyleMap as NodeStyleMap,
  getNodeStyle,
  setNodeColor,
  setNodeSize,
} from './graphStyleStorage'

export { loadStyles, saveStyles, removeStyle, clearStyles } from './graphStyleStorage'
