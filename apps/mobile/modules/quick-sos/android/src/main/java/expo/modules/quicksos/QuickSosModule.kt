package expo.modules.quicksos

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class QuickSosSettingsPatch : Record {
  @Field
  val powerButtonEnabled: Boolean? = null

  @Field
  val countdownSeconds: Int? = null

  @Field
  val testMode: Boolean? = null
}

/**
 * SOS rápido no Android: botão liga/desliga 3x (serviço em primeiro plano) e bloco nas
 * Configurações Rápidas. O disparo é nativo (funciona com o app fechado); o JS só espelha a
 * sessão (URL da API + token) e recebe o resultado.
 */
class QuickSosModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() =
    ModuleDefinition {
      Name("QuickSos")

      Events("onTrigger")

      OnStartObserving {
        QuickSosEvents.listener = { result -> sendEvent("onTrigger", result.toMap()) }
      }

      OnStopObserving {
        QuickSosEvents.listener = null
      }

      Function("getCapabilities") {
        mapOf(
          "powerButton" to true,
          "quickTile" to (Build.VERSION.SDK_INT >= 24),
          "addTilePrompt" to (Build.VERSION.SDK_INT >= 33),
          "appIntents" to false,
        )
      }

      AsyncFunction("setSession") { apiBaseUrl: String, accessToken: String ->
        QuickSosStore.setSession(context, apiBaseUrl, accessToken)
        PowerButtonService.sync(context)
      }

      AsyncFunction("clearSession") {
        QuickSosStore.clearSession(context)
        PowerButtonService.sync(context)
      }

      AsyncFunction("getSettings") {
        val ctx = context
        QuickSosStore.settings(ctx).toMap() + ("serviceRunning" to PowerButtonService.shouldRun(ctx))
      }

      AsyncFunction("setSettings") { patch: QuickSosSettingsPatch ->
        val ctx = context
        val current = QuickSosStore.settings(ctx)
        val next =
          current.copy(
            powerButtonEnabled = patch.powerButtonEnabled ?: current.powerButtonEnabled,
            countdownSeconds =
              patch.countdownSeconds?.let { QuickSosSettings.clampCountdown(it) } ?: current.countdownSeconds,
            testMode = patch.testMode ?: current.testMode,
          )
        QuickSosStore.saveSettings(ctx, next)
        val running = PowerButtonService.sync(ctx)
        next.toMap() + ("serviceRunning" to running)
      }

      AsyncFunction("consumePendingTrigger") {
        QuickSosStore.consumePending(context)?.toMap()
      }

      // Mesmo fluxo do gesto (contagem + envio), para testar pelo app.
      AsyncFunction("triggerNow") {
        QuickSosController.request(context, QuickSosController.SOURCE_APP)
        QuickSosController.isCountingDown
      }.runOnQueue(Queues.MAIN)

      AsyncFunction("cancelCountdown") {
        QuickSosController.cancel(context)
      }.runOnQueue(Queues.MAIN)

      // 2 = adicionado, 1 = já estava, 0 = recusado, -1 = sem suporte (Android < 13).
      AsyncFunction("requestAddTile") { promise: Promise ->
        if (Build.VERSION.SDK_INT < 33) {
          promise.resolve(-1)
          return@AsyncFunction
        }
        val ctx = context
        val manager = ctx.getSystemService(StatusBarManager::class.java)
        if (manager == null) {
          promise.resolve(-1)
          return@AsyncFunction
        }
        manager.requestAddTileService(
          ComponentName(ctx.packageName, QuickSosTileService::class.java.name),
          ctx.getString(R.string.quick_sos_tile_label),
          Icon.createWithResource(ctx, R.drawable.ic_quick_sos),
          ctx.mainExecutor,
        ) { result -> promise.resolve(result) }
      }

      AsyncFunction("isIgnoringBatteryOptimizations") {
        val ctx = context
        val pm = ctx.getSystemService(PowerManager::class.java)
        Build.VERSION.SDK_INT < 23 || pm?.isIgnoringBatteryOptimizations(ctx.packageName) == true
      }

      // Lista de otimização de bateria (não exige a permissão restrita REQUEST_IGNORE_...).
      AsyncFunction("openBatterySettings") {
        val ctx = context
        val intents =
          listOf(
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")),
          )
        for (intent in intents) {
          try {
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return@AsyncFunction true
          } catch (_: Exception) {
          }
        }
        false
      }
    }
}
