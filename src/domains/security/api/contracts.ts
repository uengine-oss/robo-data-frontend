/** Runtime contracts for the Data Secure Guard boundary. */

export interface User {
  uid: string
  email: string
  username: string
  status: 'active' | 'inactive'
  roles: string[]
  created_at: string
  last_login_at?: string
}

export interface UserCreate {
  email: string
  username: string
  password: string
  roles: string[]
}

export interface UserUpdate {
  username?: string
  roles?: string[]
  status?: 'active' | 'inactive'
}

export interface Role {
  name: string
  description: string
  priority: number
  is_system: boolean
  permissions: string[]
}

export interface RoleCreate {
  name: string
  description: string
  priority: number
  permissions: string[]
}

export interface Permission {
  action: string
  resource_type: string
  description?: string
}

export interface AuditLog {
  log_id: string
  user_email: string
  session_id: string
  original_sql: string
  rewritten_sql?: string
  status: 'allowed' | 'denied' | 'rewritten'
  timestamp: string
  execution_time_ms?: number
  details?: string
}

export interface AuditLogCreate {
  user_email: string
  session_id: string
  original_sql: string
  rewritten_sql?: string
  status: 'allowed' | 'denied' | 'rewritten'
  execution_time_ms?: number
  details?: string
}

export interface SecurityTable {
  name: string
  schema: string
  db: string
  description?: string
  column_count: number
}

export interface AccessRule {
  path: string
  target_type: 'user' | 'role'
  target_name: string
  level: 'none' | 'read' | 'write' | 'admin' | 'inherited'
  inherited_from?: string
}

export interface EffectiveAccess {
  path: string
  target_type: string
  target_name: string
  effective_level: string | null
  inherited_from: string | null
}

type JsonRecord = Record<string, unknown>

function record(value: unknown, contract: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${contract} 응답은 객체여야 합니다.`)
  }
  return value as JsonRecord
}

function array(value: unknown, contract: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${contract} 응답은 배열이어야 합니다.`)
  return value
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} 필드는 문자열이어야 합니다.`)
  return value
}

function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : text(value, field)
}

function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} 필드는 유한한 숫자여야 합니다.`)
  }
  return value
}

function optionalNumber(value: unknown, field: string): number | undefined {
  return value === undefined || value === null ? undefined : number(value, field)
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} 필드는 boolean이어야 합니다.`)
  return value
}

function stringArray(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => text(item, `${field}[${index}]`))
}

function oneOf<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${field} 필드 값이 지원 범위를 벗어났습니다.`)
  }
  return value as T
}

export function parseSecurityUser(value: unknown): User {
  const item = record(value, 'Security user')
  return {
    uid: text(item.uid, 'user.uid'),
    email: text(item.email, 'user.email'),
    username: text(item.username, 'user.username'),
    status: oneOf(item.status, 'user.status', ['active', 'inactive'] as const),
    roles: stringArray(item.roles, 'user.roles'),
    created_at: text(item.created_at, 'user.created_at'),
    last_login_at: optionalText(item.last_login_at, 'user.last_login_at'),
  }
}

export function parseSecurityUsers(value: unknown): User[] {
  return array(value, 'Security users').map(parseSecurityUser)
}

export function parseSecurityRole(value: unknown): Role {
  const item = record(value, 'Security role')
  return {
    name: text(item.name, 'role.name'),
    description: text(item.description, 'role.description'),
    priority: number(item.priority, 'role.priority'),
    is_system: boolean(item.is_system, 'role.is_system'),
    permissions: stringArray(item.permissions, 'role.permissions'),
  }
}

export function parseSecurityRoles(value: unknown): Role[] {
  return array(value, 'Security roles').map(parseSecurityRole)
}

export function parseSecurityPermission(value: unknown): Permission {
  const item = record(value, 'Security permission')
  return {
    action: text(item.action, 'permission.action'),
    resource_type: text(item.resource_type, 'permission.resource_type'),
    description: optionalText(item.description, 'permission.description'),
  }
}

export function parseSecurityPermissions(value: unknown): Permission[] {
  return array(value, 'Security permissions').map(parseSecurityPermission)
}

export function parseSecurityAuditLog(value: unknown): AuditLog {
  const item = record(value, 'Security audit log')
  return {
    log_id: text(item.log_id, 'audit_log.log_id'),
    user_email: text(item.user_email, 'audit_log.user_email'),
    session_id: text(item.session_id, 'audit_log.session_id'),
    original_sql: text(item.original_sql, 'audit_log.original_sql'),
    rewritten_sql: optionalText(item.rewritten_sql, 'audit_log.rewritten_sql'),
    status: oneOf(item.status, 'audit_log.status', ['allowed', 'denied', 'rewritten'] as const),
    timestamp: text(item.timestamp, 'audit_log.timestamp'),
    execution_time_ms: optionalNumber(item.execution_time_ms, 'audit_log.execution_time_ms'),
    details: optionalText(item.details, 'audit_log.details'),
  }
}

export function parseSecurityAuditLogs(value: unknown): AuditLog[] {
  return array(value, 'Security audit logs').map(parseSecurityAuditLog)
}

export function parseSecurityTable(value: unknown): SecurityTable {
  const item = record(value, 'Security table')
  return {
    name: text(item.name, 'table.name'),
    schema: text(item.schema, 'table.schema'),
    db: text(item.db, 'table.db'),
    description: optionalText(item.description, 'table.description'),
    column_count: number(item.column_count, 'table.column_count'),
  }
}

export function parseSecurityTables(value: unknown): SecurityTable[] {
  return array(value, 'Security tables').map(parseSecurityTable)
}

export function parseSecurityAccessRule(value: unknown): AccessRule {
  const item = record(value, 'Security access rule')
  return {
    path: text(item.path, 'access_rule.path'),
    target_type: oneOf(item.target_type, 'access_rule.target_type', ['user', 'role'] as const),
    target_name: text(item.target_name, 'access_rule.target_name'),
    level: oneOf(item.level, 'access_rule.level', ['none', 'read', 'write', 'admin', 'inherited'] as const),
    inherited_from: optionalText(item.inherited_from, 'access_rule.inherited_from'),
  }
}

export function parseSecurityAccessRules(value: unknown): AccessRule[] {
  return array(value, 'Security access rules').map(parseSecurityAccessRule)
}

export function parseSecurityEffectiveAccess(value: unknown): EffectiveAccess {
  const item = record(value, 'Security effective access')
  const nullableText = (field: string): string | null => {
    const fieldValue = item[field]
    return fieldValue === null ? null : text(fieldValue, `effective_access.${field}`)
  }
  return {
    path: text(item.path, 'effective_access.path'),
    target_type: text(item.target_type, 'effective_access.target_type'),
    target_name: text(item.target_name, 'effective_access.target_name'),
    effective_level: nullableText('effective_level'),
    inherited_from: nullableText('inherited_from'),
  }
}
