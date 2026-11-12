package expo.modules.discreeticon

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Rota de volta quando o app está oculto: discar `*#*#<código>#*#*` no app Telefone
 * (código em discreetIcons.json -> secretCode, registrado pelo config plugin).
 * Devolve o ícone ao launcher e tenta abrir o app.
 */
class SecretCodeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    IconController.show(context, null)
    try {
      context.startActivity(
        Intent(Intent.ACTION_MAIN)
          .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (_: Exception) {
      // Android 10+ pode bloquear a abertura em segundo plano; o ícone já voltou.
    }
  }
}
