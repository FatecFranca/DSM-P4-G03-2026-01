package expo.modules.quicksos

import android.content.Context
import org.json.JSONObject
import java.io.File

data class QuickSosSession(val apiBaseUrl: String, val accessToken: String)

data class QuickSosSettings(
  val powerButtonEnabled: Boolean = false,
  val countdownSeconds: Int = DEFAULT_COUNTDOWN,
  val testMode: Boolean = false,
) {
  fun toMap(): Map<String, Any> =
    mapOf(
      "powerButtonEnabled" to powerButtonEnabled,
      "countdownSeconds" to countdownSeconds,
      "testMode" to testMode,
    )

  companion object {
    const val DEFAULT_COUNTDOWN = 5
    val ALLOWED_COUNTDOWNS = listOf(0, 3, 5, 10)

    fun clampCountdown(value: Int): Int =
      if (value in ALLOWED_COUNTDOWNS) value else DEFAULT_COUNTDOWN
  }
}

/**
 * Resultado de um disparo, entregue ao JS (evento ou pendente até o app abrir).
 * status: sent | already_active | test | failed | no_session
 */
data class QuickSosResult(
  val status: String,
  val source: String,
  val alertId: String?,
  val at: Long,
  val message: String? = null,
) {
  fun toMap(): Map<String, Any?> =
    mapOf(
      "status" to status,
      "source" to source,
      "alertId" to alertId,
      "at" to at.toDouble(),
      "message" to message,
    )

  fun toJson(): JSONObject =
    JSONObject()
      .put("status", status)
      .put("source", source)
      .put("alertId", alertId ?: JSONObject.NULL)
      .put("at", at)
      .put("message", message ?: JSONObject.NULL)

  companion object {
    fun fromJson(json: JSONObject): QuickSosResult =
      QuickSosResult(
        status = json.optString("status", "failed"),
        source = json.optString("source", "unknown"),
        alertId = json.optString("alertId").takeIf { it.isNotEmpty() && it != "null" },
        at = json.optLong("at", System.currentTimeMillis()),
        message = json.optString("message").takeIf { it.isNotEmpty() && it != "null" },
      )
  }
}

/**
 * Estado do atalho em um JSON em `noBackupFilesDir`: o app tem allowBackup=true e o token
 * de acesso não deve ir para o backup do Google. Só este app (sandbox) lê o arquivo.
 */
object QuickSosStore {
  private const val FILE_NAME = "quick_sos.json"
  private val lock = Any()

  private fun file(context: Context) = File(context.applicationContext.noBackupFilesDir, FILE_NAME)

  private fun read(context: Context): JSONObject =
    synchronized(lock) {
      val f = file(context)
      if (!f.exists()) return JSONObject()
      try {
        JSONObject(f.readText())
      } catch (_: Exception) {
        JSONObject()
      }
    }

  private fun update(context: Context, block: (JSONObject) -> Unit) =
    synchronized(lock) {
      val json = read(context)
      block(json)
      val f = file(context)
      val tmp = File(f.parentFile, "$FILE_NAME.tmp")
      tmp.writeText(json.toString())
      if (!tmp.renameTo(f)) {
        f.writeText(json.toString())
        tmp.delete()
      }
    }

  fun session(context: Context): QuickSosSession? {
    val json = read(context)
    val url = json.optString("apiBaseUrl")
    val token = json.optString("accessToken")
    if (url.isEmpty() || token.isEmpty()) return null
    return QuickSosSession(url, token)
  }

  fun setSession(context: Context, apiBaseUrl: String, accessToken: String) =
    update(context) {
      it.put("apiBaseUrl", apiBaseUrl.trimEnd('/'))
      it.put("accessToken", accessToken)
    }

  fun clearSession(context: Context) =
    update(context) {
      it.remove("accessToken")
      it.remove("pending")
    }

  fun settings(context: Context): QuickSosSettings {
    val json = read(context).optJSONObject("settings") ?: return QuickSosSettings()
    return QuickSosSettings(
      powerButtonEnabled = json.optBoolean("powerButtonEnabled", false),
      countdownSeconds =
        QuickSosSettings.clampCountdown(
          json.optInt("countdownSeconds", QuickSosSettings.DEFAULT_COUNTDOWN),
        ),
      testMode = json.optBoolean("testMode", false),
    )
  }

  fun saveSettings(context: Context, settings: QuickSosSettings) =
    update(context) {
      it.put(
        "settings",
        JSONObject()
          .put("powerButtonEnabled", settings.powerButtonEnabled)
          .put("countdownSeconds", settings.countdownSeconds)
          .put("testMode", settings.testMode),
      )
    }

  fun setPending(context: Context, result: QuickSosResult) =
    update(context) { it.put("pending", result.toJson()) }

  fun consumePending(context: Context): QuickSosResult? {
    var out: QuickSosResult? = null
    update(context) {
      val pending = it.optJSONObject("pending")
      if (pending != null) {
        out = QuickSosResult.fromJson(pending)
        it.remove("pending")
      }
    }
    return out
  }
}
