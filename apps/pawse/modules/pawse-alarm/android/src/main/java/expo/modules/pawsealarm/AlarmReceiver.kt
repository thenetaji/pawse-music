package expo.modules.pawsealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmScheduler.ACTION_FIRE -> {
        val plan = AlarmScheduler.load(context) ?: return
        if (plan.daysMask == 0) AlarmScheduler.save(context, null) else AlarmScheduler.arm(context)
        AlarmNotification.show(context, plan.title, plan.text)
      }
      AlarmScheduler.ACTION_STOP -> AlarmNotification.cancel(context)
    }
  }
}

/** Alarms don't survive a reboot or a clock change on their own. */
class AlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AlarmScheduler.arm(context)
  }
}
