export interface DesktopFileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

export type DesktopFileReadResult =
  | { kind: 'text'; content: string }
  | { kind: 'binary' }
  | { kind: 'too-large'; size: number }

export type DesktopFileSystemResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } }

export interface DesktopFileSystemBridge {
  listDir(input: { root: string; path: string }): Promise<DesktopFileSystemResult<DesktopFileEntry[]>>
  readFile(input: { root: string; path: string }): Promise<DesktopFileSystemResult<DesktopFileReadResult>>
  writeFile(input: { root: string; path: string; content: string }): Promise<DesktopFileSystemResult<{ ok: true }>>
  rename(input: { root: string; from: string; to: string }): Promise<DesktopFileSystemResult<{ ok: true }>>
  copy(input: { root: string; from: string; to: string }): Promise<DesktopFileSystemResult<{ ok: true }>>
  trash(input: { root: string; path: string }): Promise<DesktopFileSystemResult<{ ok: true }>>
  mkdir(input: { root: string; path: string }): Promise<DesktopFileSystemResult<{ ok: true }>>
}

declare global {
  interface Window {
    desktop?: {
      fs?: DesktopFileSystemBridge
    }
  }
}

/** Host capability boundary for the Architect Electron preload bridge. */
export function getDesktopFileSystemBridge(): DesktopFileSystemBridge | undefined {
  return window.desktop?.fs
}
