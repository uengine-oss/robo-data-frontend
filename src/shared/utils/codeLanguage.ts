const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', pc: 'cpp',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python',
  sql: 'sql', psql: 'pgsql', pgsql: 'pgsql',
  php: 'php', go: 'go', cs: 'csharp', rb: 'ruby', rs: 'rust',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', bat: 'bat', cmd: 'bat',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', xsd: 'xml', xsl: 'xml', xslt: 'xml', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less', vue: 'html',
  properties: 'ini', ini: 'ini', toml: 'ini', env: 'ini',
  dockerfile: 'dockerfile', md: 'markdown', proto: 'protobuf',
}
const LANGUAGE_ALIAS: Readonly<Record<string, string>> = {
  c: 'cpp', 'c++': 'cpp', cpp: 'cpp',
  js: 'javascript', javascript: 'javascript', jsx: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  py: 'python', python: 'python',
  postgres: 'pgsql', postgresql: 'pgsql', plpgsql: 'pgsql',
  shellscript: 'shell', bash: 'shell', sh: 'shell',
  csharp: 'csharp', 'c#': 'csharp',
  yml: 'yaml', text: 'plaintext', txt: 'plaintext', plain: 'plaintext',
}

/** 명시 힌트 우선, 원본 경로 확장자 차선, 미확인은 plaintext. */
export function resolveCodeLanguage(filePath?: string | null, languageHint?: string | null): string {
  const hint = String(languageHint ?? '').trim().toLowerCase()
  if (hint) return LANGUAGE_ALIAS[hint] ?? EXTENSION_LANGUAGE[hint] ?? hint

  const base = String(filePath ?? '').replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
  if (!base) return 'plaintext'
  if (base === 'dockerfile') return 'dockerfile'
  const dot = base.lastIndexOf('.')
  if (dot < 0 || dot === base.length - 1) return 'plaintext'
  return EXTENSION_LANGUAGE[base.slice(dot + 1)] ?? 'plaintext'
}
