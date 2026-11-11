package expo.modules.discreeticon

import android.content.ComponentName
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ALIAS_MARKER = ".discreet."

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

    // Chave do ícone explicitamente habilitado; null = nenhum foi escolhido (vale o padrão).
    AsyncFunction("getActiveIcon") {
      val pm = context.packageManager
      listAliases().firstOrNull { alias ->
        pm.getComponentEnabledSetting(ComponentName(context.packageName, alias.name)) ==
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      }?.let { keyOf(it) }
    }

    AsyncFunction("setActiveIcon") { key: String ->
      val pm = context.packageManager
      val aliases = listAliases()
      val target = aliases.firstOrNull { keyOf(it) == key } ?: throw UnknownIconException(key)

      // Habilita o novo ANTES de desabilitar os outros: nunca fica sem ícone no launcher.
      pm.setComponentEnabledSetting(
        ComponentName(context.packageName, target.name),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP,
      )
      aliases.filter { it.name != target.name }.forEach { other ->
        pm.setComponentEnabledSetting(
          ComponentName(context.packageName, other.name),
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP,
        )
      }
      key
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

  private fun keyOf(info: ActivityInfo): String = info.name.substringAfterLast(ALIAS_MARKER)

  @Suppress("DEPRECATION")
  private fun listAliases(): List<ActivityInfo> {
    val pm = context.packageManager
    val flags = PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS
    val info =
      if (Build.VERSION.SDK_INT >= 33) {
        pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
      } else {
        pm.getPackageInfo(context.packageName, flags)
      }
    return info.activities.orEmpty().filter { it.name.contains(ALIAS_MARKER) }
  }
}
