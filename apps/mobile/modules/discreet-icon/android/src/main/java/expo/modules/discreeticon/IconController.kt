package expo.modules.discreeticon

import android.content.ComponentName
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Build

/**
 * Regras compartilhadas entre o módulo JS e o receiver do código secreto:
 * cada disfarce é um `activity-alias` (gerado por plugins/withDiscreetIcons.js) e
 * "ocultar o app" = desabilitar TODOS os aliases (o app fica sem ícone no launcher).
 */
object IconController {
  const val ALIAS_MARKER = ".discreet."
  private const val PREFS = "discreet_icon"
  private const val KEY_LAST_VISIBLE = "last_visible_key"

  fun keyOf(info: ActivityInfo): String = info.name.substringAfterLast(ALIAS_MARKER)

  @Suppress("DEPRECATION")
  fun listAliases(context: Context): List<ActivityInfo> {
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

  // Estado explícito vence; sem ele vale o `android:enabled` do manifesto.
  private fun isEnabled(context: Context, alias: ActivityInfo): Boolean =
    when (context.packageManager.getComponentEnabledSetting(ComponentName(context.packageName, alias.name))) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      PackageManager.COMPONENT_ENABLED_STATE_DISABLED -> false
      else -> alias.enabled
    }

  /** Chave do disfarce visível no launcher; null se o app estiver oculto. */
  fun visibleKey(context: Context): String? =
    listAliases(context).firstOrNull { isEnabled(context, it) }?.let { keyOf(it) }

  fun isHidden(context: Context): Boolean {
    val aliases = listAliases(context)
    return aliases.isNotEmpty() && aliases.none { isEnabled(context, it) }
  }

  private fun setEnabled(context: Context, alias: ActivityInfo, enabled: Boolean) {
    context.packageManager.setComponentEnabledSetting(
      ComponentName(context.packageName, alias.name),
      if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
      PackageManager.DONT_KILL_APP,
    )
  }

  /** Mostra o disfarce [key] e desabilita os demais. Retorna false se a chave não existe. */
  fun setActive(context: Context, key: String): Boolean {
    val aliases = listAliases(context)
    val target = aliases.firstOrNull { keyOf(it) == key } ?: return false
    // Habilita o novo ANTES de desabilitar os outros: nunca fica sem ícone no launcher.
    setEnabled(context, target, true)
    aliases.filter { it.name != target.name }.forEach { setEnabled(context, it, false) }
    return true
  }

  /** Tira o app do launcher, guardando qual disfarce deve voltar. */
  fun hide(context: Context) {
    visibleKey(context)?.let { key ->
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LAST_VISIBLE, key).apply()
    }
    listAliases(context).forEach { setEnabled(context, it, false) }
  }

  /** Devolve o ícone ao launcher: o último disfarce usado, ou [fallbackKey], ou o primeiro alias. */
  fun show(context: Context, fallbackKey: String?): Boolean {
    val aliases = listAliases(context)
    if (aliases.isEmpty()) return false
    val last = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_VISIBLE, null)
    val key =
      listOfNotNull(last, fallbackKey).firstOrNull { candidate -> aliases.any { keyOf(it) == candidate } }
        ?: keyOf(aliases.first())
    return setActive(context, key)
  }
}
