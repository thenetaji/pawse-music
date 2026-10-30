package expo.modules.pawsealarm

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PawseAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PawseAlarm")

    Function<Boolean>("isSupported") { true }

    Function<Boolean>("canScheduleExact") { AlarmScheduler.canScheduleExact(context) }

    Function<Boolean>("canUseFullScreen") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    // days: 0 = Sunday ... 6 = Saturday; empty rings once.
    Function("schedule") { hour: Int, minute: Int, days: List<Int>, title: String, text: String ->
      val mask = days.filter { it in 0..6 }.fold(0) { acc, d -> acc or (1 shl d) }
      AlarmScheduler.save(context, AlarmPlan(hour, minute, mask, title, text))
      AlarmScheduler.arm(context)
    }

    Function("cancel") {
      AlarmScheduler.disarm(context)
      AlarmNotification.cancel(context)
    }

    Function("dismiss") { AlarmNotification.cancel(context) }
  }
}
