/** Session-aware, runtime-validated Data Secure Guard client. */
import { API_GATEWAY_URL, handleHttpError, type Headers } from '@/shared/services/http'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  parseSecurityAccessRules,
  parseSecurityAuditLog,
  parseSecurityAuditLogs,
  parseSecurityEffectiveAccess,
  parseSecurityPermissions,
  parseSecurityRole,
  parseSecurityRoles,
  parseSecurityTables,
  parseSecurityUser,
  parseSecurityUsers,
  type AccessRule,
  type AuditLog,
  type AuditLogCreate,
  type EffectiveAccess,
  type Permission,
  type Role,
  type RoleCreate,
  type SecurityTable,
  type User,
  type UserCreate,
  type UserUpdate,
} from './contracts'

export * from './contracts'

const SECURITY_URL = `${API_GATEWAY_URL}/security`

function sessionHeaders(): Headers {
  return useRuntimeStore().getHeaders()
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${SECURITY_URL}${path}`, {
    ...init,
    headers: {
      ...sessionHeaders(),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  })
  if (!response.ok) await handleHttpError(response)
  return response
}

async function requestJson<T>(
  path: string,
  parse: (value: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, init)
  return parse(await response.json() as unknown)
}

const jsonBody = (value: unknown): string => JSON.stringify(value)

export const getUsers = (): Promise<User[]> => requestJson('/users', parseSecurityUsers)

export const createUser = (user: UserCreate): Promise<User> => requestJson('/users', parseSecurityUser, {
  method: 'POST', body: jsonBody(user),
})

export const updateUser = (uid: string, updates: UserUpdate): Promise<User> =>
  requestJson(`/users/${encodeURIComponent(uid)}`, parseSecurityUser, {
    method: 'PATCH', body: jsonBody(updates),
  })

export async function deleteUser(uid: string): Promise<void> {
  await request(`/users/${encodeURIComponent(uid)}`, { method: 'DELETE' })
}

export const getRoles = (): Promise<Role[]> => requestJson('/roles', parseSecurityRoles)

export const createRole = (role: RoleCreate): Promise<Role> => requestJson('/roles', parseSecurityRole, {
  method: 'POST', body: jsonBody(role),
})

export async function deleteRole(name: string): Promise<void> {
  await request(`/roles/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export const getPermissions = (): Promise<Permission[]> => requestJson('/permissions', parseSecurityPermissions)

export async function getAuditLogs(filter?: {
  user_email?: string
  status?: string
  limit?: number
}): Promise<AuditLog[]> {
  const params = new URLSearchParams()
  if (filter?.user_email) params.set('user_email', filter.user_email)
  if (filter?.status) params.set('status', filter.status)
  if (filter?.limit !== undefined) {
    if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 1000) {
      throw new Error('audit log limit은 1 이상 1000 이하의 정수여야 합니다.')
    }
    params.set('limit', String(filter.limit))
  }
  const query = params.size > 0 ? `?${params}` : ''
  return requestJson(`/audit-logs${query}`, parseSecurityAuditLogs)
}

export const createAuditLog = (entry: AuditLogCreate): Promise<AuditLog> =>
  requestJson('/audit-logs', parseSecurityAuditLog, { method: 'POST', body: jsonBody(entry) })

export const getTables = (): Promise<SecurityTable[]> => requestJson('/tables', parseSecurityTables)

export async function getAccessRules(path?: string): Promise<AccessRule[]> {
  const query = path === undefined ? '' : `?${new URLSearchParams({ path })}`
  return requestJson(`/access-rules${query}`, parseSecurityAccessRules)
}

export async function saveAccessRule(rule: AccessRule): Promise<void> {
  await request('/access-rules', { method: 'POST', body: jsonBody(rule) })
}

export async function deleteAccessRule(
  path: string,
  targetType: string,
  targetName: string,
): Promise<void> {
  const params = new URLSearchParams({ path, target_type: targetType, target_name: targetName })
  await request(`/access-rules?${params}`, { method: 'DELETE' })
}

export function getEffectiveAccess(
  path: string,
  targetType: 'user' | 'role',
  targetName: string,
): Promise<EffectiveAccess> {
  const params = new URLSearchParams({ path, target_type: targetType, target_name: targetName })
  return requestJson(`/effective-access?${params}`, parseSecurityEffectiveAccess)
}
