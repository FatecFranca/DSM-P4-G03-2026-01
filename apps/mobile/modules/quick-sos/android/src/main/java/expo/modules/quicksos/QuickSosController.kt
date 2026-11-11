package expo.modules.quicksos

import android.content.Context
import android.os.Handler
import android.os.Looper

/**
 * Orquestra um disparo: contagem regressiva (cancelável repetindo o gesto, tocando no bloco
 * ou na notificação) -> envio nativo -> feedback (vibração + notificação) -> aviso ao JS.
 * Todas as entradas públicas devem ser chamadas na main thread.
 */
object QuickSosController {
  const val SOURCE_POWER = "power_button"
  const val SOURCE_TILE = "quick_tile"
  const val SOURCE_APP = "app"

  private val handler = Handler(Looper.getMainLooper())
  private var pendingFire: Runnable? = null

  @Volatile
  var isSending = false
    private set

  val isCountingDown: Boolean
    get() = pendingFire != null

  /** Pede um disparo. Se já houver contagem em andamento, cancela (o mesmo gesto desfaz). */
  fun request(context: Context, source: String) {
    val app = context.applicationContext
    if (pendingFire != null) {
      cancel(app)
      return
    }
    if (isSending) return

    val seconds = QuickSosStore.settings(app).countdownSeconds
    if (seconds <= 0) {
      fire(app, source)
      return
    }
    QuickSosFeedback.armed(app)
    val runnable =
      Runnable {
        pendingFire = null
        QuickSosFeedback.clearCountdown(app)
        fire(app, source)
      }
    pendingFire = runnable
    QuickSosFeedback.showCountdown(app, seconds)
    handler.postDelayed(runnable, seconds * 1000L)
    QuickSosTileService.refresh(app)
  }

  /** Cancela a contagem; retorna true se havia algo para cancelar. */
  fun cancel(context: Context): Boolean {
    val app = context.applicationContext
    val runnable = pendingFire ?: return false
    handler.removeCallbacks(runnable)
    pendingFire = null
    QuickSosFeedback.clearCountdown(app)
    QuickSosFeedback.cancelled(app)
    QuickSosTileService.refresh(app)
    return true
  }

  private fun fire(app: Context, source: String) {
    isSending = true
    QuickSosTileService.refresh(app)
    Thread({
      val result =
        try {
          QuickSosSender.send(app, source)
        } catch (e: Exception) {
          QuickSosResult("failed", source, null, System.currentTimeMillis(), e.message)
        }
      handler.post {
        isSending = false
        val ok = result.status == "sent" || result.status == "already_active" || result.status == "test"
        QuickSosFeedback.result(app, ok)
        QuickSosStore.setPending(app, result)
        QuickSosFeedback.showResult(app, result)
        QuickSosEvents.emit(result)
        QuickSosTileService.refresh(app)
      }
    }, "QuickSosSender").start()
  }
}

/** Ponte para o módulo JS: só existe listener enquanto há assinantes do evento. */
object QuickSosEvents {
  @Volatile
  var listener: ((QuickSosResult) -> Unit)? = null

  fun emit(result: QuickSosResult) {
    listener?.invoke(result)
  }
}
