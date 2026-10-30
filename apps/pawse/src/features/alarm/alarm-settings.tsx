import { alarmSupported, useAlarm } from "./alarm";
import { daysText, timeText } from "./alarm-core";

/** The alarm's time and days for Settings, "Off" when it is not set; null where alarms can't ring. */
export function useAlarmSummary(): string | null {
  const { on, hour, minute, days } = useAlarm();
  if (!alarmSupported()) return null;
  return on ? `${timeText(hour, minute)}, ${daysText(days)}` : "Off";
}
