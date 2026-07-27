declare module './autoLayout/bpmnAutoLayout.js' {
  export function applyAutoLayout(xml: string, horizontal?: boolean): Promise<string>
}

declare module './customBpmn/index.js' {
  import type { ModuleDeclaration } from 'didi'
  const customBpmnModule: ModuleDeclaration
  export default customBpmnModule
}

declare module 'dmn-js/lib/Modeler' {
  interface ModelerOptions {
    container: HTMLElement
    keyboard?: { bindTo: Document | HTMLElement }
  }

  export default class DmnModeler {
    constructor(options: ModelerOptions)
    importXML(xml: string): Promise<unknown>
    saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>
    destroy(): void
  }
}
