package expo.modules.quicksos

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.SystemClock

/**
 * Serviço em primeiro plano que conta os liga/desliga da tela (cada toque no botão power
 * alterna a tela). 3 toques rápidos = pedido de SOS. Ignora alternâncias durante chamadas
 * (o sensor de proximidade apaga/acende a tela sozinho).
 */
class PowerButtonService : Service() {
  private val detector = PowerPressDetector()
  private var registered = false

  private val screenReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_SCREEN_ON && intent.action != Intent.ACTION_SCREEN_OFF) return
        if (isInCall()) {
          detector.reset()
          return
        }
        if (detector.onPress(SystemClock.elapsedRealtime())) {
          QuickSosController.request(this@PowerButtonService, QuickSosController.SOURCE_POWER)
        }
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    val filter =
      IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_SCREEN_OFF)
      }
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }
    registered = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = QuickSosFeedback.serviceNotification(this)
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(
          QuickSosFeedback.SERVICE_NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
        )
      } else {
        startForeground(QuickSosFeedback.SERVICE_NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (!shouldRun(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    if (registered) {
      try {
        unregisterReceiver(screenReceiver)
      } catch (_: Exception) {
      }
      registered = false
    }
    super.onDestroy()
  }

  private fun isInCall(): Boolean {
    val audio = getSystemService(AudioManager::class.java) ?: return false
    return audio.mode == AudioManager.MODE_IN_CALL || audio.mode == AudioManager.MODE_IN_COMMUNICATION
  }

  companion object {
    fun shouldRun(context: Context): Boolean {
      val settings = QuickSosStore.settings(context)
      return settings.powerButtonEnabled &&
        (settings.testMode || QuickSosStore.session(context) != null)
    }

    /** Liga ou desliga o serviço conforme preferências + sessão. Retorna se ficou rodando. */
    fun sync(context: Context): Boolean {
      val app = context.applicationContext
      val intent = Intent(app, PowerButtonService::class.java)
      if (!shouldRun(app)) {
        app.stopService(intent)
        return false
      }
      return try {
        if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
        true
      } catch (_: Exception) {
        // Android 12+: início em segundo plano não permitido; tenta de novo quando o app abrir.
        false
      }
    }
  }
}
