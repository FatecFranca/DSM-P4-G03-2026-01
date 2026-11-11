package expo.modules.quicksos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Religa o serviço do botão power depois de reiniciar o aparelho ou atualizar o app. */
class QuickSosBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      PowerButtonService.sync(context)
    }
  }
}

/** Ação "Cancelar" da notificação de contagem regressiva. */
class QuickSosActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_CANCEL) {
      QuickSosController.cancel(context)
    }
  }

  companion object {
    const val ACTION_CANCEL = "expo.modules.quicksos.CANCEL"
  }
}
