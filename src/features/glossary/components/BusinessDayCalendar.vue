<script setup lang="ts">
/**
 * BusinessDayCalendar.vue
 * 영업일 캘린더 관리 탭
 * 타임시리즈 데이터에서 비영업일을 필터아웃하기 위한 영업일 설정
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { businessCalendarApi, type BusinessDay } from '@/services/api'
import { IconPlus, IconTrash, IconChevronLeft, IconChevronRight, IconCheck, IconCalendar } from '@/components/icons'

const sessionStore = useSessionStore()

// 상태
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth()) // 0-based
const businessDays = ref<BusinessDay[]>([])
const selectedDates = ref<Set<string>>(new Set())  // 비영업일 날짜 세트
const bulkMode = ref<'add' | 'remove'>('add')
const showBulkPanel = ref(false)

// 비영업일 사유 입력
const nonBusinessDayReason = ref('')

// 기본 비영업일 (주말)
const includeWeekends = ref(true)  // 주말을 자동으로 비영업일로 처리

// 공휴일 목록
const holidays = ref<Array<{date: string, name: string}>>([])
const showHolidayModal = ref(false)
const newHolidayDate = ref('')
const newHolidayName = ref('')

// 월 이름
const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const weekDayNames = ['일', '월', '화', '수', '목', '금', '토']

// 현재 월의 달력 데이터 계산
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = firstDay.getDay()
  
  const days: Array<{
    date: string
    day: number
    isCurrentMonth: boolean
    isWeekend: boolean
    isNonBusinessDay: boolean
    isHoliday: boolean
    holidayName?: string
    reason?: string
  }> = []
  
  // 이전 월의 날짜
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const dateStr = formatDate(prevYear, prevMonth, d)
    days.push({
      date: dateStr,
      day: d,
      isCurrentMonth: false,
      isWeekend: isWeekendDate(prevYear, prevMonth, d),
      isNonBusinessDay: isNonBusinessDay(dateStr),
      isHoliday: isHolidayDate(dateStr),
      holidayName: getHolidayName(dateStr),
      reason: getNonBusinessDayReason(dateStr)
    })
  }
  
  // 현재 월의 날짜
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = formatDate(year, month, d)
    days.push({
      date: dateStr,
      day: d,
      isCurrentMonth: true,
      isWeekend: isWeekendDate(year, month, d),
      isNonBusinessDay: isNonBusinessDay(dateStr),
      isHoliday: isHolidayDate(dateStr),
      holidayName: getHolidayName(dateStr),
      reason: getNonBusinessDayReason(dateStr)
    })
  }
  
  // 다음 월의 날짜 (6행 맞추기)
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    const dateStr = formatDate(nextYear, nextMonth, d)
    days.push({
      date: dateStr,
      day: d,
      isCurrentMonth: false,
      isWeekend: isWeekendDate(nextYear, nextMonth, d),
      isNonBusinessDay: isNonBusinessDay(dateStr),
      isHoliday: isHolidayDate(dateStr),
      holidayName: getHolidayName(dateStr),
      reason: getNonBusinessDayReason(dateStr)
    })
  }
  
  return days
})

// 통계
const stats = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const lastDay = new Date(year, month + 1, 0).getDate()
  
  let totalDays = lastDay
  let weekendDays = 0
  let holidayDays = 0
  let nonBusinessDays = 0
  
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = formatDate(year, month, d)
    if (isWeekendDate(year, month, d)) weekendDays++
    if (isHolidayDate(dateStr)) holidayDays++
    if (isNonBusinessDay(dateStr)) nonBusinessDays++
  }
  
  const businessDayCount = totalDays - nonBusinessDays
  
  return { totalDays, weekendDays, holidayDays, nonBusinessDays, businessDayCount }
})

// 유틸 함수
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isWeekendDate(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month, day).getDay()
  return dow === 0 || dow === 6
}

function isNonBusinessDay(dateStr: string): boolean {
  // 명시적으로 비영업일로 등록된 날짜
  if (selectedDates.value.has(dateStr)) return true
  
  // 주말 자동 비영업일 처리
  if (includeWeekends.value) {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (isWeekendDate(y, m - 1, d)) return true
  }
  
  // 공휴일
  if (isHolidayDate(dateStr)) return true
  
  return false
}

function isHolidayDate(dateStr: string): boolean {
  return holidays.value.some(h => h.date === dateStr)
}

function getHolidayName(dateStr: string): string | undefined {
  const h = holidays.value.find(h => h.date === dateStr)
  return h?.name
}

function getNonBusinessDayReason(dateStr: string): string | undefined {
  const bd = businessDays.value.find(b => b.date === dateStr && !b.isBusinessDay)
  return bd?.reason
}

// 날짜 클릭 핸들러
function toggleDate(dateStr: string) {
  if (selectedDates.value.has(dateStr)) {
    selectedDates.value.delete(dateStr)
  } else {
    selectedDates.value.add(dateStr)
  }
  // reactivity trigger
  selectedDates.value = new Set(selectedDates.value)
}

// 월 네비게이션
function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

function goToToday() {
  const now = new Date()
  currentYear.value = now.getFullYear()
  currentMonth.value = now.getMonth()
}

// 데이터 로드
async function loadBusinessDays() {
  loading.value = true
  error.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    const result = await businessCalendarApi.getBusinessDays(headers, currentYear.value)
    businessDays.value = result.businessDays
    
    // 비영업일을 selectedDates에 로드
    selectedDates.value = new Set(
      result.businessDays
        .filter((bd: BusinessDay) => !bd.isBusinessDay)
        .map((bd: BusinessDay) => bd.date)
    )
    
    // 공휴일 로드
    holidays.value = result.holidays || []
    
    // 주말 설정 로드
    if (result.settings) {
      includeWeekends.value = result.settings.excludeWeekends ?? true
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '영업일 데이터를 불러오는 데 실패했습니다.'
  } finally {
    loading.value = false
  }
}

// 영업일 저장
async function saveBusinessDays() {
  saving.value = true
  error.value = null
  successMessage.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    
    // 비영업일 목록 만들기
    const nonBusinessDaysList = Array.from(selectedDates.value).map(date => ({
      date,
      isBusinessDay: false,
      reason: getNonBusinessDayReason(date) || '수동 지정'
    }))
    
    await businessCalendarApi.saveBusinessDays(headers, {
      year: currentYear.value,
      nonBusinessDays: nonBusinessDaysList,
      holidays: holidays.value,
      settings: {
        excludeWeekends: includeWeekends.value
      }
    })
    
    successMessage.value = '영업일 설정이 저장되었습니다.'
    setTimeout(() => { successMessage.value = null }, 3000)
    
    await loadBusinessDays()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '영업일 설정 저장에 실패했습니다.'
  } finally {
    saving.value = false
  }
}

// 공휴일 추가
function addHoliday() {
  if (!newHolidayDate.value || !newHolidayName.value) return
  
  holidays.value.push({
    date: newHolidayDate.value,
    name: newHolidayName.value
  })
  
  newHolidayDate.value = ''
  newHolidayName.value = ''
  showHolidayModal.value = false
}

// 공휴일 삭제
function removeHoliday(index: number) {
  holidays.value.splice(index, 1)
}

// 대한민국 공휴일 자동 추가
function addKoreanHolidays() {
  const year = currentYear.value
  const koreanHolidays = [
    { date: `${year}-01-01`, name: '신정' },
    { date: `${year}-03-01`, name: '삼일절' },
    { date: `${year}-05-05`, name: '어린이날' },
    { date: `${year}-06-06`, name: '현충일' },
    { date: `${year}-08-15`, name: '광복절' },
    { date: `${year}-10-03`, name: '개천절' },
    { date: `${year}-10-09`, name: '한글날' },
    { date: `${year}-12-25`, name: '성탄절' },
  ]
  
  for (const h of koreanHolidays) {
    if (!holidays.value.some(existing => existing.date === h.date)) {
      holidays.value.push(h)
    }
  }
  
  holidays.value.sort((a, b) => a.date.localeCompare(b.date))
}

// 초기 로드
onMounted(() => {
  loadBusinessDays()
})

// 연도 변경 시 다시 로드
watch(currentYear, () => {
  loadBusinessDays()
})
</script>

<template>
  <div class="business-calendar-tab">
    <!-- 왼쪽: 설정 사이드바 -->
    <aside class="calendar-sidebar">
      <div class="sidebar-header">
        <h3>영업일 설정</h3>
      </div>
      
      <!-- 통계 -->
      <div class="stats-section">
        <h4>{{ currentYear }}년 {{ monthNames[currentMonth] }} 통계</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value business">{{ stats.businessDayCount }}</span>
            <span class="stat-label">영업일</span>
          </div>
          <div class="stat-item">
            <span class="stat-value non-business">{{ stats.nonBusinessDays }}</span>
            <span class="stat-label">비영업일</span>
          </div>
          <div class="stat-item">
            <span class="stat-value weekend">{{ stats.weekendDays }}</span>
            <span class="stat-label">주말</span>
          </div>
          <div class="stat-item">
            <span class="stat-value holiday">{{ stats.holidayDays }}</span>
            <span class="stat-label">공휴일</span>
          </div>
        </div>
      </div>
      
      <!-- 주말 설정 -->
      <div class="settings-section">
        <h4>기본 설정</h4>
        <label class="checkbox-label">
          <input type="checkbox" v-model="includeWeekends" />
          <span>주말(토/일)을 비영업일로 처리</span>
        </label>
      </div>
      
      <!-- 공휴일 관리 -->
      <div class="holidays-section">
        <div class="section-header">
          <h4>공휴일</h4>
          <div class="section-actions">
            <button class="btn-text-sm" @click="addKoreanHolidays" title="대한민국 공휴일 추가">
              🇰🇷 자동추가
            </button>
            <button class="btn-icon-sm" @click="showHolidayModal = true" title="공휴일 추가">
              <IconPlus :size="14" />
            </button>
          </div>
        </div>
        
        <div class="holiday-list">
          <div v-for="(holiday, idx) in holidays" :key="holiday.date" class="holiday-item">
            <span class="holiday-date">{{ holiday.date }}</span>
            <span class="holiday-name">{{ holiday.name }}</span>
            <button class="btn-icon-xs" @click="removeHoliday(idx)" title="삭제">
              <IconTrash :size="12" />
            </button>
          </div>
          <div v-if="holidays.length === 0" class="empty-holidays">
            공휴일이 등록되지 않았습니다.
          </div>
        </div>
      </div>
      
      <!-- 저장 버튼 -->
      <div class="sidebar-footer">
        <button class="btn-primary" @click="saveBusinessDays" :disabled="saving">
          <IconCheck :size="16" />
          {{ saving ? '저장 중...' : '설정 저장' }}
        </button>
      </div>
    </aside>
    
    <!-- 메인: 캘린더 -->
    <main class="calendar-main">
      <!-- 알림 -->
      <div v-if="error" class="alert alert-error">
        {{ error }}
        <button class="alert-close" @click="error = null">×</button>
      </div>
      <div v-if="successMessage" class="alert alert-success">
        {{ successMessage }}
        <button class="alert-close" @click="successMessage = null">×</button>
      </div>
      
      <!-- 캘린더 헤더 -->
      <header class="calendar-header">
        <div class="header-left">
          <h1>
            <IconCalendar :size="24" />
            영업일 캘린더
          </h1>
          <p class="description">타임시리즈 데이터 분석 시 비영업일을 자동으로 필터아웃합니다. 비영업일을 클릭하여 설정/해제하세요.</p>
        </div>
        
        <div class="calendar-nav">
          <button class="btn-nav" @click="prevMonth">
            <IconChevronLeft :size="18" />
          </button>
          <h2 class="current-month">{{ currentYear }}년 {{ monthNames[currentMonth] }}</h2>
          <button class="btn-nav" @click="nextMonth">
            <IconChevronRight :size="18" />
          </button>
          <button class="btn-today" @click="goToToday">오늘</button>
        </div>
      </header>
      
      <!-- 범례 -->
      <div class="legend">
        <div class="legend-item">
          <span class="legend-dot business-day"></span>
          <span>영업일</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot non-business-day"></span>
          <span>비영업일 (수동)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot weekend-day"></span>
          <span>주말</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot holiday-day"></span>
          <span>공휴일</span>
        </div>
      </div>
      
      <!-- 캘린더 그리드 -->
      <div class="calendar-grid" :class="{ loading: loading }">
        <!-- 요일 헤더 -->
        <div class="weekday-header" v-for="day in weekDayNames" :key="day"
          :class="{ weekend: day === '토' || day === '일' }">
          {{ day }}
        </div>
        
        <!-- 날짜 셀 -->
        <button
          v-for="(day, idx) in calendarDays"
          :key="idx"
          class="calendar-cell"
          :class="{
            'other-month': !day.isCurrentMonth,
            'weekend': day.isWeekend,
            'non-business': day.isNonBusinessDay,
            'holiday': day.isHoliday,
            'selected': selectedDates.has(day.date),
            'today': day.date === formatDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
          }"
          @click="day.isCurrentMonth && toggleDate(day.date)"
          :title="day.isHoliday ? day.holidayName : (day.isNonBusinessDay ? '비영업일' : '영업일')"
        >
          <span class="cell-day">{{ day.day }}</span>
          <span v-if="day.isHoliday" class="cell-holiday">{{ day.holidayName }}</span>
          <span v-if="day.isNonBusinessDay && !day.isWeekend && !day.isHoliday" class="cell-badge">휴</span>
        </button>
      </div>
      
      <!-- 로딩 -->
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <span>로딩 중...</span>
      </div>
    </main>
    
    <!-- 공휴일 추가 모달 -->
    <div v-if="showHolidayModal" class="modal-overlay" @click.self="showHolidayModal = false">
      <div class="modal-content">
        <h3>공휴일 추가</h3>
        <div class="form-group">
          <label>날짜</label>
          <input type="date" v-model="newHolidayDate" />
        </div>
        <div class="form-group">
          <label>공휴일명</label>
          <input type="text" v-model="newHolidayName" placeholder="예: 설날" />
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showHolidayModal = false">취소</button>
          <button class="btn-primary" @click="addHoliday" :disabled="!newHolidayDate || !newHolidayName">추가</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.business-calendar-tab {
  flex: 1;
  display: flex;
  overflow: hidden;
  height: 100%;
}

// =============== Sidebar ===============
.calendar-sidebar {
  width: 280px;
  min-width: 280px;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--color-border);
  
  h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }
}

.stats-section {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  
  h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-light);
    margin: 0 0 12px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-item {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: 10px;
  text-align: center;
  
  .stat-value {
    display: block;
    font-size: 22px;
    font-weight: 700;
    
    &.business { color: #22c55e; }
    &.non-business { color: #ef4444; }
    &.weekend { color: #8b5cf6; }
    &.holiday { color: #f97316; }
  }
  
  .stat-label {
    display: block;
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }
}

.settings-section {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  
  h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-light);
    margin: 0 0 10px;
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--color-accent);
  }
}

.holidays-section {
  padding: 16px;
  flex: 1;
  
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    
    h4 {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-light);
      margin: 0;
    }
    
    .section-actions {
      display: flex;
      gap: 4px;
    }
  }
}

.holiday-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.holiday-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  font-size: 12px;
  
  .holiday-date {
    color: var(--color-text-muted);
    font-family: monospace;
    font-size: 11px;
  }
  
  .holiday-name {
    flex: 1;
    color: var(--color-text);
    font-weight: 500;
  }
}

.empty-holidays {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 12px 0;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  margin-top: auto;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.15s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  
  &:hover {
    background: var(--color-bg-secondary);
  }
}

.btn-text-sm {
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  
  &:hover {
    background: rgba(34, 139, 230, 0.1);
  }
}

.btn-icon-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}

.btn-icon-xs {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 0;
  
  &:hover {
    color: #ef4444;
  }
}

// =============== Calendar Main ===============
.calendar-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px 24px;
  position: relative;
}

.alert {
  padding: 10px 16px;
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  
  &.alert-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }
  
  &.alert-success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }
  
  .alert-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 18px;
    padding: 0 4px;
  }
}

.calendar-header {
  margin-bottom: 16px;
  
  .header-left {
    margin-bottom: 12px;
    
    h1 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 20px;
      font-weight: 700;
      color: var(--color-text);
      margin: 0 0 4px;
    }
    
    .description {
      font-size: 13px;
      color: var(--color-text-muted);
      margin: 0;
    }
  }
  
  .calendar-nav {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.btn-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text);
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.current-month {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  min-width: 140px;
  text-align: center;
}

.btn-today {
  padding: 6px 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.legend {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-light);
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  
  &.business-day { background: #22c55e20; border: 1px solid #22c55e; }
  &.non-business-day { background: #ef444420; border: 1px solid #ef4444; }
  &.weekend-day { background: #8b5cf620; border: 1px solid #8b5cf6; }
  &.holiday-day { background: #f9731620; border: 1px solid #f97316; }
}

// =============== Calendar Grid ===============
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  
  &.loading {
    opacity: 0.5;
    pointer-events: none;
  }
}

.weekday-header {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 8px 0;
  
  &.weekend {
    color: #8b5cf6;
  }
}

.calendar-cell {
  position: relative;
  aspect-ratio: 1.4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 4px 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.1s ease;
  min-height: 64px;
  
  &:hover {
    border-color: var(--color-accent);
    transform: scale(1.02);
    z-index: 1;
  }
  
  &.other-month {
    opacity: 0.3;
    cursor: default;
    
    &:hover {
      border-color: var(--color-border);
      transform: none;
    }
  }
  
  &.weekend {
    background: rgba(139, 92, 246, 0.05);
    
    .cell-day {
      color: #8b5cf6;
    }
  }
  
  &.non-business {
    background: rgba(239, 68, 68, 0.06);
    border-color: rgba(239, 68, 68, 0.2);
  }
  
  &.holiday {
    background: rgba(249, 115, 22, 0.08);
    border-color: rgba(249, 115, 22, 0.3);
  }
  
  &.selected {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.5);
    box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.2);
  }
  
  &.today {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.3);
    
    .cell-day {
      background: var(--color-accent);
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
}

.cell-day {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.cell-holiday {
  font-size: 9px;
  color: #f97316;
  font-weight: 500;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.cell-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 8px;
  font-weight: 700;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
  padding: 1px 4px;
  border-radius: 4px;
}

// =============== Loading ===============
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.1);
  z-index: 10;
  
  span {
    font-size: 13px;
    color: var(--color-text-muted);
  }
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// =============== Modal ===============
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  padding: 24px;
  min-width: 360px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  
  h3 {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }
}

.form-group {
  margin-bottom: 12px;
  
  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-light);
    margin-bottom: 4px;
  }
  
  input {
    width: 100%;
    padding: 8px 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 13px;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
