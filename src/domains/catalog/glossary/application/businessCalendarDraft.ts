import type {
  BusinessDay,
  SaveBusinessDaysRequest,
} from '../api.ts'

export interface CalendarHoliday {
  date: string
  name: string
}

export interface BusinessCalendarDay {
  date: string
  day: number
  isCurrentMonth: boolean
  isWeekend: boolean
  isNonBusinessDay: boolean
  isHoliday: boolean
  holidayName?: string
  reason?: string
}

export interface BusinessCalendarStats {
  totalDays: number
  weekendDays: number
  holidayDays: number
  nonBusinessDays: number
  businessDayCount: number
}

export function formatCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isWeekendDate(year: number, month: number, day: number): boolean {
  const dayOfWeek = new Date(year, month, day).getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

function holidayForDate(holidays: CalendarHoliday[], date: string) {
  return holidays.find(holiday => holiday.date === date)
}

function reasonForDate(businessDays: BusinessDay[], date: string) {
  return businessDays.find(day => day.date === date && !day.isBusinessDay)?.reason
}

export function isNonBusinessDate(
  date: string,
  selectedDates: ReadonlySet<string>,
  includeWeekends: boolean,
  holidays: CalendarHoliday[],
): boolean {
  if (selectedDates.has(date) || holidayForDate(holidays, date)) return true
  if (!includeWeekends) return false
  const [year, month, day] = date.split('-').map(Number)
  return isWeekendDate(year, month - 1, day)
}

export function buildBusinessCalendarDays(input: {
  year: number
  month: number
  selectedDates: ReadonlySet<string>
  includeWeekends: boolean
  holidays: CalendarHoliday[]
  businessDays: BusinessDay[]
}): BusinessCalendarDay[] {
  const { year, month, selectedDates, includeWeekends, holidays, businessDays } = input
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: BusinessCalendarDay[] = []

  function addDay(dayYear: number, dayMonth: number, day: number, isCurrentMonth: boolean) {
    const date = formatCalendarDate(dayYear, dayMonth, day)
    const holiday = holidayForDate(holidays, date)
    days.push({
      date,
      day,
      isCurrentMonth,
      isWeekend: isWeekendDate(dayYear, dayMonth, day),
      isNonBusinessDay: isNonBusinessDate(
        date,
        selectedDates,
        includeWeekends,
        holidays,
      ),
      isHoliday: Boolean(holiday),
      holidayName: holiday?.name,
      reason: reasonForDate(businessDays, date),
    })
  }

  const previousMonthLastDay = new Date(year, month, 0).getDate()
  for (let offset = firstDay.getDay() - 1; offset >= 0; offset -= 1) {
    addDay(
      month === 0 ? year - 1 : year,
      month === 0 ? 11 : month - 1,
      previousMonthLastDay - offset,
      false,
    )
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    addDay(year, month, day, true)
  }
  const remaining = 42 - days.length
  for (let day = 1; day <= remaining; day += 1) {
    addDay(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, day, false)
  }
  return days
}

export function calculateBusinessCalendarStats(input: {
  year: number
  month: number
  selectedDates: ReadonlySet<string>
  includeWeekends: boolean
  holidays: CalendarHoliday[]
}): BusinessCalendarStats {
  const { year, month, selectedDates, includeWeekends, holidays } = input
  const totalDays = new Date(year, month + 1, 0).getDate()
  let weekendDays = 0
  let holidayDays = 0
  let nonBusinessDays = 0
  for (let day = 1; day <= totalDays; day += 1) {
    const date = formatCalendarDate(year, month, day)
    if (isWeekendDate(year, month, day)) weekendDays += 1
    if (holidayForDate(holidays, date)) holidayDays += 1
    if (isNonBusinessDate(date, selectedDates, includeWeekends, holidays)) {
      nonBusinessDays += 1
    }
  }
  return {
    totalDays,
    weekendDays,
    holidayDays,
    nonBusinessDays,
    businessDayCount: totalDays - nonBusinessDays,
  }
}

export function buildSaveBusinessDaysRequest(input: {
  year: number
  selectedDates: ReadonlySet<string>
  holidays: CalendarHoliday[]
  includeWeekends: boolean
  businessDays: BusinessDay[]
}): SaveBusinessDaysRequest {
  return {
    year: input.year,
    nonBusinessDays: [...input.selectedDates].sort().map(date => ({
      date,
      isBusinessDay: false,
      reason: reasonForDate(input.businessDays, date) ?? '수동 지정',
    })),
    holidays: input.holidays.map(holiday => ({ ...holiday })),
    settings: { excludeWeekends: input.includeWeekends },
  }
}

export function mergeFixedKoreanHolidays(
  year: number,
  holidays: CalendarHoliday[],
): CalendarHoliday[] {
  const fixedHolidays: CalendarHoliday[] = [
    { date: `${year}-01-01`, name: '신정' },
    { date: `${year}-03-01`, name: '삼일절' },
    { date: `${year}-05-05`, name: '어린이날' },
    { date: `${year}-06-06`, name: '현충일' },
    { date: `${year}-08-15`, name: '광복절' },
    { date: `${year}-10-03`, name: '개천절' },
    { date: `${year}-10-09`, name: '한글날' },
    { date: `${year}-12-25`, name: '성탄절' },
  ]
  const byDate = new Map(holidays.map(holiday => [holiday.date, { ...holiday }]))
  for (const holiday of fixedHolidays) {
    if (!byDate.has(holiday.date)) byDate.set(holiday.date, holiday)
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}
