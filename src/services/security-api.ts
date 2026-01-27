/**
 * Security Guard API Service
 * API Gateway를 통해 data-secure-guard에 연결
 */

// API Gateway를 통해 접근 (기본 포트 9000)
const API_GATEWAY = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:9000'

// Types
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
  status?: string
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
  status: string
  execution_time_ms?: number
  details?: string
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

// =====================
// User Management
// =====================

/**
 * 사용자 목록 조회 (Neo4j)
 */
export async function getUsers(): Promise<User[]> {
  const response = await fetch(`${API_GATEWAY}/api/security/users`)
  if (!response.ok) {
    console.error('Failed to fetch users:', response.status)
    return []
  }
  return response.json()
}

/**
 * 사용자 생성
 */
export async function createUser(user: UserCreate): Promise<User> {
  const response = await fetch(`${API_GATEWAY}/api/security/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  })
  if (!response.ok) throw new Error('Failed to create user')
  return response.json()
}

/**
 * 사용자 수정
 */
export async function updateUser(uid: string, updates: UserUpdate): Promise<User> {
  const response = await fetch(`${API_GATEWAY}/api/security/users/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
  if (!response.ok) throw new Error('Failed to update user')
  return response.json()
}

/**
 * 사용자 삭제
 */
export async function deleteUser(uid: string): Promise<void> {
  const response = await fetch(`${API_GATEWAY}/api/security/users/${uid}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete user')
}


// =====================
// Role Management
// =====================

/**
 * 역할 목록 조회 (Neo4j)
 */
export async function getRoles(): Promise<Role[]> {
  const response = await fetch(`${API_GATEWAY}/api/security/roles`)
  if (!response.ok) {
    console.error('Failed to fetch roles:', response.status)
    return []
  }
  return response.json()
}

/**
 * 역할 생성
 */
export async function createRole(role: RoleCreate): Promise<Role> {
  const response = await fetch(`${API_GATEWAY}/api/security/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(role)
  })
  if (!response.ok) throw new Error('Failed to create role')
  return response.json()
}

/**
 * 역할 삭제
 */
export async function deleteRole(name: string): Promise<void> {
  const response = await fetch(`${API_GATEWAY}/api/security/roles/${name}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete role')
}


// =====================
// Permissions
// =====================

/**
 * 권한 목록 조회
 */
export async function getPermissions(): Promise<Permission[]> {
  const response = await fetch(`${API_GATEWAY}/api/security/permissions`)
  if (!response.ok) {
    console.error('Failed to fetch permissions:', response.status)
    return []
  }
  return response.json()
}


// =====================
// Audit Logs (File System)
// =====================

/**
 * 감사 로그 조회
 */
export async function getAuditLogs(filter?: {
  user_email?: string
  status?: string
  limit?: number
}): Promise<AuditLog[]> {
  const params = new URLSearchParams()
  if (filter) {
    if (filter.user_email) params.append('user_email', filter.user_email)
    if (filter.status) params.append('status', filter.status)
    if (filter.limit) params.append('limit', String(filter.limit))
  }
  const response = await fetch(`${API_GATEWAY}/api/security/audit-logs?${params}`)
  if (!response.ok) {
    console.error('Failed to fetch audit logs:', response.status)
    return []
  }
  return response.json()
}

/**
 * 감사 로그 기록
 */
export async function createAuditLog(entry: AuditLogCreate): Promise<AuditLog> {
  const response = await fetch(`${API_GATEWAY}/api/security/audit-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  })
  if (!response.ok) throw new Error('Failed to create audit log')
  return response.json()
}


// =====================
// Tables (Neo4j)
// =====================

/**
 * 테이블 목록 조회 (Neo4j에서)
 */
export async function getTables(): Promise<Array<{
  name: string
  schema: string
  db: string
  description?: string
  column_count: number
}>> {
  const response = await fetch(`${API_GATEWAY}/api/security/tables`)
  if (!response.ok) {
    console.error('Failed to fetch tables:', response.status)
    return []
  }
  return response.json()
}


// =====================
// Access Control (계층적 권한)
// =====================

/**
 * 접근 규칙 조회
 */
export async function getAccessRules(path?: string): Promise<AccessRule[]> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  const response = await fetch(`${API_GATEWAY}/api/security/access-rules${params}`)
  if (!response.ok) {
    console.error('Failed to fetch access rules:', response.status)
    return []
  }
  return response.json()
}

/**
 * 접근 규칙 저장
 */
export async function saveAccessRule(rule: AccessRule): Promise<void> {
  const response = await fetch(`${API_GATEWAY}/api/security/access-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  })
  if (!response.ok) throw new Error('Failed to save access rule')
}

/**
 * 접근 규칙 삭제
 */
export async function deleteAccessRule(path: string, targetType: string, targetName: string): Promise<void> {
  const params = new URLSearchParams({
    path,
    target_type: targetType,
    target_name: targetName
  })
  const response = await fetch(`${API_GATEWAY}/api/security/access-rules?${params}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete access rule')
}

/**
 * 실효 권한 조회 (상속 포함)
 */
export async function getEffectiveAccess(
  path: string,
  targetType: 'user' | 'role',
  targetName: string
): Promise<EffectiveAccess> {
  const params = new URLSearchParams({
    path,
    target_type: targetType,
    target_name: targetName
  })
  const response = await fetch(`${API_GATEWAY}/api/security/effective-access?${params}`)
  if (!response.ok) throw new Error('Failed to get effective access')
  return response.json()
}
