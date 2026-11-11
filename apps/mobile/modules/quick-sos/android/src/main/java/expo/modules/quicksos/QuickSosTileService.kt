package expo.modules.quicksos

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Bloco "Pedir ajuda" nas Configurações Rápidas. Funciona com a tela bloqueada (não pede
 * desbloqueio). Tocar de novo durante a contagem cancela.
 */
class QuickSosTileService : TileService() {
  override fun onStartListening() {
    render()
  }

  override fun onClick() {
    val settings = QuickSosStore.settings(this)
    if (!settings.testMode && QuickSosStore.session(this) == null) {
      // Sem login no app: não há como enviar. Abre o app (pede desbloqueio).
      unlockAndRun { openApp() }
      return
    }
    QuickSosController.request(this, QuickSosController.SOURCE_TILE)
    render()
  }

  private fun render() {
    val tile = qsTile ?: return
    val busy = QuickSosController.isCountingDown || QuickSosController.isSending
    tile.state = if (busy) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.label = getString(R.string.quick_sos_tile_label)
    if (Build.VERSION.SDK_INT >= 29) {
      tile.subtitle = if (QuickSosController.isCountingDown) getString(R.string.quick_sos_tile_counting) else null
    }
    tile.updateTile()
  }

  private fun openApp() {
    val intent =
      Intent(Intent.ACTION_MAIN)
        .setComponent(ComponentName(packageName, "$packageName.MainActivity"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(
        PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }

  companion object {
    fun refresh(context: Context) {
      try {
        requestListeningState(context, ComponentName(context, QuickSosTileService::class.java))
      } catch (_: Exception) {
      }
    }
  }
}
