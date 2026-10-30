package expo.modules.pawsealarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar

internal class AlarmPlan(
  val hour: Int,
  val minute: Int,
  // Bit n rings on weekday n, 0 = Sunday; 0 rings once.
  val daysMask: Int,
  val title: String,
  val text: String
)

internal object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.pawsealarm.FIRE"
  const val ACTION_STOP = "expo.modules.pawsealarm.STOP"
  private const val PREFS = "pawse_alarm"

  fun save(context: Context, plan: AlarmPlan?) {
    val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    if (plan == null) {
      edit.clear()
    } else {
      edit.putInt("hour", plan.hour).putInt("minute", plan.minute).putInt("days", plan.daysMask)
        .putString("title", plan.title).putString("text", plan.text)
    }
    edit.apply()
  }

  fun load(context: Context): AlarmPlan? {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!p.contains("hour")) return null
    return AlarmPlan(
      p.getInt("hour", 7),
      p.getInt("minute", 0),
      p.getInt("days", 0),
      p.getString("title", "") ?: "",
      p.getString("text", "") ?: ""
    )
  }

  fun nextTrigger(plan: AlarmPlan, from: Calendar = Calendar.getInstance()): Long {
    for (offset in 0..7) {
      val day = from.clone() as Calendar
      day.add(Calendar.DAY_OF_YEAR, offset)
      day.set(Calendar.HOUR_OF_DAY, plan.hour)
      day.set(Calendar.MINUTE, plan.minute)
      day.set(Calendar.SECOND, 0)
      day.set(Calendar.MILLISECOND, 0)
      val weekday = day.get(Calendar.DAY_OF_WEEK) - 1
      val allowed = plan.daysMask == 0 || ((plan.daysMask shr weekday) and 1) == 1
      if (allowed && day.timeInMillis > from.timeInMillis + 1000) return day.timeInMillis
    }
    return from.timeInMillis + 24 * 60 * 60 * 1000
  }

  fun canScheduleExact(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

  private fun fireIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      1,
      Intent(context, AlarmReceiver::class.java).setAction(ACTION_FIRE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  fun arm(context: Context): Boolean {
    val plan = load(context) ?: return false
    val manager = context.getSystemService(AlarmManager::class.java)
    return try {
      manager.setAlarmClock(
        AlarmManager.AlarmClockInfo(nextTrigger(plan), AlarmNotification.openApp(context)),
        fireIntent(context)
      )
      true
    } catch (_: SecurityException) {
      false
    }
  }

  fun disarm(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(fireIntent(context))
    save(context, null)
  }
}
