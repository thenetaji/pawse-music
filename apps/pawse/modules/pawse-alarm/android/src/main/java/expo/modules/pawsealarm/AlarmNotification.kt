package expo.modules.pawsealarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import android.os.Build

internal object AlarmNotification {
  private const val CHANNEL = "pawse_wake"
  private const val ID = 4242

  private fun chime(context: Context): Uri =
    Uri.parse("android.resource://${context.packageName}/${R.raw.pawse_chime}")

  fun openApp(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context,
      2,
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  // The pawse:// link reaches the app's /wake route, which starts the music.
  private fun wake(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context,
      3,
      Intent(Intent.ACTION_VIEW, Uri.parse("pawse://wake"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun stop(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      4,
      Intent(context, AlarmReceiver::class.java).setAction(AlarmScheduler.ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  @Suppress("DEPRECATION")
  fun show(context: Context, title: String, text: String) {
    val manager = context.getSystemService(NotificationManager::class.java)
    val builder: Notification.Builder
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL, "Wake-up alarm", NotificationManager.IMPORTANCE_HIGH)
      channel.setSound(
        chime(context),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      channel.enableVibration(true)
      channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      manager.createNotificationChannel(channel)
      builder = Notification.Builder(context, CHANNEL).setTimeoutAfter(120_000)
    } else {
      builder = Notification.Builder(context)
        .setSound(chime(context), AudioManager.STREAM_ALARM)
        .setPriority(Notification.PRIORITY_MAX)
    }
    val wakeIntent = wake(context)
    val stopAction = Notification.Action.Builder(
      Icon.createWithResource(context, R.drawable.pawse_alarm_icon),
      "Stop",
      stop(context)
    ).build()
    val notification = builder
      .setSmallIcon(R.drawable.pawse_alarm_icon)
      .setContentTitle(title)
      .setContentText(text)
      .setCategory(Notification.CATEGORY_ALARM)
      .setContentIntent(wakeIntent)
      .setFullScreenIntent(wakeIntent, true)
      .setAutoCancel(true)
      .addAction(stopAction)
      .build()
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    manager.notify(ID, notification)
  }

  fun cancel(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(ID)
  }
}
