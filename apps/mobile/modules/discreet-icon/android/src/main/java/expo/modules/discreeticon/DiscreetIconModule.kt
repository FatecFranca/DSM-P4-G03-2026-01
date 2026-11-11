package expo.modules.discreeticon

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UnknownIconException(key: String) :
  CodedException("ERR_UNKNOWN_ICON", "Ícone '$key' não existe neste build.", null)

/**
 * Troca o ícone/nome do atalho no launcher habilitando um `activity-alias` por vez
 * (gerados pelo plugin plugins/withDiscreetIcons.js) e desabilitando os demais.
 */
class DiscreetIconModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DiscreetIcon")

    // Chave do ícone visível no launcher; null = app oculto.
    AsyncFunction("getActiveIcon") { IconController.visibleKey(context) }

    AsyncFunction("setActiveIcon") { key: String ->
      if (!IconController.setActive(context, key)) throw UnknownIconException(key)
      key
    }

    // true = o app não tem ícone no launcher.
    AsyncFunction("isIconHidden") { IconController.isHidden(context) }

    // hidden=true tira o app do launcher; hidden=false devolve o último disfarce (ou fallbackKey).
    AsyncFunction("setIconHidden") { hidden: Boolean, fallbackKey: String? ->
      if (hidden) {
        IconController.hide(context)
      } else {
        IconController.show(context, fallbackKey)
      }
      hidden
    }

    // Pede ao sistema (Android 13+) para adicionar o tile "abrir o app" às Configurações Rápidas.
    // Resolve com: 2 = adicionado, 1 = já estava, 0 = recusado, -1 = sem suporte, <-1 = erro.
    AsyncFunction("requestAddQuickTile") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 33) {
        promise.resolve(-1)
        return@AsyncFunction
      }
      val ctx = context
      val res = ctx.resources
      val iconId = res.getIdentifier("ic_discreet_tile", "drawable", ctx.packageName)
      val labelId = res.getIdentifier("discreet_tile_label", "string", ctx.packageName)
      val manager = ctx.getSystemService(StatusBarManager::class.java)
      if (manager == null || iconId == 0 || labelId == 0) {
        promise.resolve(-1)
        return@AsyncFunction
      }
      manager.requestAddTileService(
        ComponentName(ctx.packageName, OpenAppTileService::class.java.name),
        ctx.getString(labelId),
        Icon.createWithResource(ctx, iconId),
        ctx.mainExecutor,
      ) { result -> promise.resolve(result) }
    }

    // Esconde a prévia do app na tela de apps recentes.
    // Android 13+: só a miniatura (screenshots continuam permitidos).
    // Android < 13: FLAG_SECURE (também bloqueia capturas de tela).
    AsyncFunction("setPrivacyScreen") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= 33) {
          activity.setRecentsScreenshotEnabled(!enabled)
        } else if (enabled) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
      }
      true
    }
  }
}
