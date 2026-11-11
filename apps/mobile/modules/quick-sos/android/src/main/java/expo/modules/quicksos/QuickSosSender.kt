package expo.modules.quicksos

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Dispara o alerta direto na API, sem depender do JS (o app pode estar fechado):
 * POST /alerts/start e, em seguida, um ponto de GPS em POST /alerts/:id/location.
 * Roda em thread de fundo (faz rede e espera GPS).
 */
object QuickSosSender {
  private const val TIMEOUT_MS = 10_000
  private val RETRY_DELAYS_MS = longArrayOf(0, 2_000, 5_000)
  private const val LOCATION_MAX_AGE_MS = 2 * 60_000L
  private const val LOCATION_FIX_TIMEOUT_MS = 10_000L
  private const val STALE_FIX_MS = 90_000L

  private data class HttpResponse(val status: Int, val body: JSONObject?)

  fun send(context: Context, source: String): QuickSosResult {
    val now = System.currentTimeMillis()
    if (QuickSosStore.settings(context).testMode) {
      return QuickSosResult("test", source, null, now)
    }
    val session =
      QuickSosStore.session(context)
        ?: return QuickSosResult("no_session", source, null, now, "Sessão não encontrada")

    var last: HttpResponse? = null
    for (delay in RETRY_DELAYS_MS) {
      if (delay > 0) SystemClock.sleep(delay)
      val res = http("POST", "${session.apiBaseUrl}/alerts/start", session.accessToken, JSONObject().put("mode", "discreet"))
      last = res
      when {
        res.status == 201 || res.status == 200 -> {
          val id = res.body?.optJSONObject("alert")?.optString("id")?.takeIf { it.isNotEmpty() }
          if (id != null) {
            sendLocation(context, session, id)
            return QuickSosResult("sent", source, id, System.currentTimeMillis())
          }
        }
        res.status == 409 -> {
          val active = http("GET", "${session.apiBaseUrl}/alerts/active", session.accessToken, null)
          val id = active.body?.optJSONObject("alert")?.optString("id")?.takeIf { it.isNotEmpty() }
          if (id != null) sendLocation(context, session, id)
          return QuickSosResult("already_active", source, id, System.currentTimeMillis())
        }
        res.status == 401 || res.status == 403 ->
          return QuickSosResult("no_session", source, null, System.currentTimeMillis(), "Sessão expirada")
        res.status in 400..499 ->
          return QuickSosResult("failed", source, null, System.currentTimeMillis(), "HTTP ${res.status}")
      }
      // status 0 (rede) ou 5xx: tenta de novo.
    }
    val reason = if (last?.status == 0) "Sem conexão com o servidor" else "HTTP ${last?.status}"
    return QuickSosResult("failed", source, null, System.currentTimeMillis(), reason)
  }

  private fun http(method: String, url: String, token: String, body: JSONObject?): HttpResponse {
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Authorization", "Bearer $token")
        if (body != null) {
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
        }
      }
      if (body != null) {
        conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      }
      val status = conn.responseCode
      val stream = if (status in 200..299) conn.inputStream else conn.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }
      val json = try {
        if (text.isNullOrBlank()) null else JSONObject(text)
      } catch (_: Exception) {
        null
      }
      HttpResponse(status, json)
    } catch (_: Exception) {
      HttpResponse(0, null)
    } finally {
      conn?.disconnect()
    }
  }

  private fun hasLocationPermission(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  /** Última posição recente; se não houver, pede um fix único com timeout. Melhor esforço. */
  private fun bestLocation(context: Context): Location? {
    if (!hasLocationPermission(context)) return null
    val lm = context.getSystemService(LocationManager::class.java) ?: return null
    val providers = try {
      lm.getProviders(true)
    } catch (_: Exception) {
      emptyList<String>()
    }
    val lastKnown =
      providers
        .mapNotNull {
          try {
            lm.getLastKnownLocation(it)
          } catch (_: SecurityException) {
            null
          }
        }.maxByOrNull { it.time }
    if (lastKnown != null && System.currentTimeMillis() - lastKnown.time <= LOCATION_MAX_AGE_MS) {
      return lastKnown
    }
    if (Build.VERSION.SDK_INT < 30) return lastKnown

    val provider =
      when {
        Build.VERSION.SDK_INT >= 31 && providers.contains(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
        providers.contains(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
        providers.contains(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
        else -> return lastKnown
      }
    val latch = CountDownLatch(1)
    var fix: Location? = null
    val executor = Executors.newSingleThreadExecutor()
    try {
      lm.getCurrentLocation(provider, null, executor) { loc ->
        fix = loc
        latch.countDown()
      }
      latch.await(LOCATION_FIX_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    } catch (_: Exception) {
      // sem permissão em background / provedor indisponível
    } finally {
      executor.shutdown()
    }
    return fix ?: lastKnown
  }

  private fun isoUtc(ms: Long): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    return fmt.format(Date(ms))
  }

  private fun sendLocation(context: Context, session: QuickSosSession, alertId: String) {
    val loc = bestLocation(context) ?: return
    val now = System.currentTimeMillis()
    // A API recusa capturedAt anterior ao início do alerta (-2 min). Sem fix novo, a última
    // posição conhecida ainda é a melhor pista: vai com o horário do disparo.
    val capturedAt = if (loc.time in (now - STALE_FIX_MS)..now) loc.time else now
    val body =
      JSONObject()
        .put("lat", loc.latitude)
        .put("lng", loc.longitude)
        .put("capturedAt", isoUtc(capturedAt))
    if (loc.hasAccuracy() && loc.accuracy > 0f && loc.accuracy <= 50_000f) body.put("accuracy", loc.accuracy.toDouble())
    if (loc.hasSpeed() && loc.speed >= 0f && loc.speed <= 400f) body.put("speed", loc.speed.toDouble())
    if (loc.hasBearing() && loc.bearing >= 0f && loc.bearing <= 360f) body.put("heading", loc.bearing.toDouble())
    http("POST", "${session.apiBaseUrl}/alerts/$alertId/location", session.accessToken, body)
  }
}
