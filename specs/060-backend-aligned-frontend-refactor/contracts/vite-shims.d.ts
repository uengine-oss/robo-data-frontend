declare module '*.vue' {
  const component: unknown
  export default component
}

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_API_GATEWAY_URL?: string
  readonly VITE_TEXT2SQL_API_URL?: string
  readonly VITE_DATA_FABRIC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
