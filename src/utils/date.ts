/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 * @returns Date string in YYYY-MM-DD format
 */
export function todayISO(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the last N days in YYYY-MM-DD format (newest to oldest)
 * @param n - Number of days to include
 * @returns Array of date strings, newest first
 */
export function lastNDaysISO(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

/**
 * Get a date N days from now in YYYY-MM-DD format
 * @param daysFromNow - Number of days from today (0 = today, 1 = tomorrow, etc.)
 * @returns Date string in YYYY-MM-DD format
 */
export function nextDateISO(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add or subtract days from a base ISO date string
 * @param baseISO - Base date in YYYY-MM-DD format
 * @param delta - Number of days to add (positive) or subtract (negative)
 * @returns Date string in YYYY-MM-DD format
 */
export function addDaysISO(baseISO: string, delta: number): string {
  const [year, month, day] = baseISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');
  return `${newYear}-${newMonth}-${newDay}`;
}

/**
 * Get current timestamp
 * @returns Current timestamp as number (milliseconds since epoch)
 */
export function nowTS(): number {
  return Date.now();
}

/**
 * Get ISO string (YYYY-MM-DD) for Monday of the week containing the provided date (default: today)
 */
export function startOfWeekISO(date: string | Date = new Date(), weekStartsOn = 1): string {
  const base = typeof date === 'string' ? parseISODate(date) : new Date(date);
  const target = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const currentDay = target.getDay();
  const offset = ((currentDay - weekStartsOn + 7) % 7);
  target.setDate(target.getDate() - offset);
  return todayISOFromDate(target);
}

export function endOfWeekISO(date: string | Date = new Date(), weekStartsOn = 1): string {
  const startISO = startOfWeekISO(date, weekStartsOn);
  return addDaysISO(startISO, 6);
}

export function isISOInRange(iso: string, startISO: string, endISO: string): boolean {
  return iso >= startISO && iso <= endISO;
}

export function minutesFromSeconds(sec: number): number {
  return Math.round(sec / 60);
}

/**
 * Convert Date object to YYYY-MM-DD respecting local timezone
 */
function todayISOFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISODate(input: string): Date {
  const [year, month, day] = input.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/**
 * Get array of ISO dates (Mon-Sun) for a week starting at the provided ISO date
 */
export function weekDatesFromStart(startISO: string): string[] {
  const [year, month, day] = startISO.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(todayISOFromDate(d));
  }
  return dates;
}

