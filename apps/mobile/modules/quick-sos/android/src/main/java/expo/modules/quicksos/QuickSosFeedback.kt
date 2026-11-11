package expo.modules.quicksos

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Vibrações (feedback sem olhar a tela) e notificações discretas do atalho. */
object QuickSosFeedback {
  const val SERVICE_CHANNEL = "quick_sos_service"
  const val EVENTS_CHANNEL = "quick_sos_events"
  const val SERVICE_NOTIFICATION_ID = 41_001
  private const val COUNTDOWN_NOTIFICATION_ID = 41_002
  private const val RESULT_NOTIFICATION_ID = 41_003

  // Padrões: armado (1 curta), cancelado (2 curtas), enviado (1 longa), falha (3 curtas).
  private val ARMED = longArrayOf(0, 90)
  private val CANCELLED = longArrayOf(0, 60, 90, 60)
  private val SENT = longArrayOf(0, 450)
  private val FAILED = longArrayOf(0, 120, 100, 120, 100, 120)

  fun armed(context: Context) = vibrate(context, ARMED)

  fun cancelled(context: Context) = vibrate(context, CANCELLED)

  fun result(context: Context, ok: Boolean) = vibrate(context, if (ok) SENT else FAILED)

  private fun vibrate(context: Context, pattern: LongArray) {
    try {
      val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) {
          context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
          @Suppress("DEPRECATION")
          context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
      if (vibrator == null || !vibrator.hasVibrator()) return
      // USAGE_ALARM: vibra mesmo com a tela apagada / app em segundo plano.
      if (Build.VERSION.SDK_INT >= 33) {
        vibrator.vibrate(
          VibrationEffect.createWaveform(pattern, -1),
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM),
        )
      } else if (Build.VERSION.SDK_INT >= 26) {
        @Suppress("DEPRECATION")
        vibrator.vibrate(
          VibrationEffect.createWaveform(pattern, -1),
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),
        )
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(pattern, -1)
      }
    } catch (_: Exception) {
      // sem vibrador / permissão: segue sem feedback tátil
    }
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(NotificationManager::class.java) ?: return
    // MIN: a notificação obrigatória do serviço fica recolhida e sem ícone na barra de status.
    nm.createNotificationChannel(
      NotificationChannel(
        SERVICE_CHANNEL,
        context.getString(R.string.quick_sos_service_channel),
        NotificationManager.IMPORTANCE_MIN,
      ).apply {
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_SECRET
      },
    )
    nm.createNotificationChannel(
      NotificationChannel(
        EVENTS_CHANNEL,
        context.getString(R.string.quick_sos_events_channel),
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      },
    )
  }

  private fun builder(context: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(context, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }

  /** Abre a MainActivity explicitamente (funciona mesmo com o ícone do launcher oculto). */
  private fun openAppIntent(context: Context): PendingIntent {
    val intent =
      Intent(Intent.ACTION_MAIN)
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  fun serviceNotification(context: Context): Notification {
    ensureChannels(context)
    return builder(context, SERVICE_CHANNEL)
      .setSmallIcon(R.drawable.ic_quick_sos)
      .setContentTitle(context.getString(R.string.quick_sos_service_title))
      .setContentText(context.getString(R.string.quick_sos_service_text))
      .setContentIntent(openAppIntent(context))
      .setOngoing(true)
      .setVisibility(Notification.VISIBILITY_SECRET)
      .build()
  }

  private fun notify(context: Context, id: Int, notification: Notification) {
    try {
      val nm = context.getSystemService(NotificationManager::class.java) ?: return
      if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) return
      nm.notify(id, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS negada
    }
  }

  fun showCountdown(context: Context, seconds: Int) {
    ensureChannels(context)
    val cancel =
      PendingIntent.getBroadcast(
        context,
        1,
        Intent(context, QuickSosActionReceiver::class.java).setAction(QuickSosActionReceiver.ACTION_CANCEL),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    val b =
      builder(context, EVENTS_CHANNEL)
        .setSmallIcon(R.drawable.ic_quick_sos)
        .setContentTitle(context.getString(R.string.quick_sos_countdown_title, seconds))
        .setContentText(context.getString(R.string.quick_sos_countdown_text))
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setOnlyAlertOnce(true)
        .setAutoCancel(true)
        .setTimeoutAfterCompat(seconds * 1000L + 2_000)
        .addAction(
          Notification.Action.Builder(null, context.getString(R.string.quick_sos_cancel), cancel).build(),
        )
    if (Build.VERSION.SDK_INT >= 24) {
      b.setUsesChronometer(true)
      b.setWhen(System.currentTimeMillis() + seconds * 1000L)
      b.setChronometerCountDown(true)
    }
    notify(context, COUNTDOWN_NOTIFICATION_ID, b.build())
  }

  fun clearCountdown(context: Context) {
    context.getSystemService(NotificationManager::class.java)?.cancel(COUNTDOWN_NOTIFICATION_ID)
  }

  fun showResult(context: Context, result: QuickSosResult) {
    ensureChannels(context)
    val (title, text) =
      when (result.status) {
        "sent", "already_active" -> R.string.quick_sos_done_title to R.string.quick_sos_done_text
        "test" -> R.string.quick_sos_test_title to R.string.quick_sos_test_text
        else -> R.string.quick_sos_failed_title to R.string.quick_sos_failed_text
      }
    notify(
      context,
      RESULT_NOTIFICATION_ID,
      builder(context, EVENTS_CHANNEL)
        .setSmallIcon(R.drawable.ic_quick_sos)
        .setContentTitle(context.getString(title))
        .setContentText(context.getString(text))
        .setContentIntent(openAppIntent(context))
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setAutoCancel(true)
        .build(),
    )
  }

  private fun Notification.Builder.setTimeoutAfterCompat(ms: Long): Notification.Builder =
    if (Build.VERSION.SDK_INT >= 26) setTimeoutAfter(ms) else this
}
