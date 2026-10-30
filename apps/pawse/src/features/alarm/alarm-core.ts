export type AlarmTime = { hour: number; minute: number; days: number[] };

// days: 0 = Sunday ... 6; empty means any day.
export function nextOccurrence(a: AlarmTime, after: number): number {
  for (let i = 0; i <= 7; i++) {
    const d = new Date(after);
    d.setDate(d.getDate() + i);
    d.setHours(a.hour, a.minute, 0, 0);
    if (d.getTime() > after && (!a.days.length || a.days.includes(d.getDay())))
      return d.getTime();
  }
  return after + 86_400_000;
}

export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day)
    ? days.filter((d) => d !== day)
    : [...days, day].sort((a, b) => a - b);
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function daysText(days: number[]): string {
  const key = days.join();
  if (!days.length) return "Once";
  if (key === "0,1,2,3,4,5,6") return "Every day";
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  return days.map((d) => NAMES[d]).join(", ");
}

export function timeText(hour: number, minute: number): string {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export const wrap = (n: number, size: number) => ((n % size) + size) % size;
