package expo.modules.discreeticon

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Atalho nas Configurações Rápidas que abre o app mesmo oculto (sem ícone no launcher).
 * Pede o desbloqueio do aparelho antes de abrir. Registrado pelo config plugin.
 */
class OpenAppTileService : TileService() {
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_ACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    unlockAndRun {
      val intent =
        Intent(Intent.ACTION_MAIN)
          .setComponent(ComponentName(packageName, "$packageName.MainActivity"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (Build.VERSION.SDK_INT >= 34) {
        val pending =
          PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        startActivityAndCollapse(pending)
      } else {
        @Suppress("DEPRECATION")
        startActivityAndCollapse(intent)
      }
    }
  }
}
