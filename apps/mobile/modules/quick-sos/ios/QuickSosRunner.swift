import CoreLocation
import Foundation
import Security

/// Resultado de um disparo. status: sent | already_active | test | failed | no_session
public struct QuickSosOutcome {
  public let status: String
  public let source: String
  public let alertId: String?
  public let at: Double
  public let message: String?

  public var succeeded: Bool {
    status == "sent" || status == "already_active" || status == "test"
  }

  public var dictionary: [String: Any] {
    var dict: [String: Any] = ["status": status, "source": source, "at": at]
    if let alertId { dict["alertId"] = alertId }
    if let message { dict["message"] = message }
    return dict
  }

  init(status: String, source: String, alertId: String? = nil, message: String? = nil) {
    self.status = status
    self.source = source
    self.alertId = alertId
    self.at = Date().timeIntervalSince1970 * 1000
    self.message = message
  }
}

/// Sessão (URL da API + token) no Keychain, acessível com o aparelho bloqueado depois do
/// primeiro desbloqueio — a Siri / o Toque traseiro podem rodar com a tela bloqueada.
enum QuickSosStorage {
  private static let service = "com.protecther.quicksos"
  private static let account = "session"
  private static let settingsKey = "quickSos.settings"
  private static let pendingKey = "quickSos.pending"

  struct Session {
    let apiBaseUrl: String
    let accessToken: String
  }

  static func session() -> Session? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
      let url = json["apiBaseUrl"], let token = json["accessToken"],
      !url.isEmpty, !token.isEmpty
    else { return nil }
    return Session(apiBaseUrl: url, accessToken: token)
  }

  static func setSession(apiBaseUrl: String, accessToken: String) {
    clearSession()
    let trimmed = apiBaseUrl.hasSuffix("/") ? String(apiBaseUrl.dropLast()) : apiBaseUrl
    guard let data = try? JSONSerialization.data(withJSONObject: ["apiBaseUrl": trimmed, "accessToken": accessToken])
    else { return }
    let attrs: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecValueData as String: data,
    ]
    SecItemAdd(attrs as CFDictionary, nil)
  }

  static func clearSession() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
    UserDefaults.standard.removeObject(forKey: pendingKey)
  }

  static var testMode: Bool {
    get { (UserDefaults.standard.dictionary(forKey: settingsKey)?["testMode"] as? Bool) ?? false }
    set { UserDefaults.standard.set(["testMode": newValue], forKey: settingsKey) }
  }

  static func setPending(_ outcome: QuickSosOutcome) {
    UserDefaults.standard.set(outcome.dictionary, forKey: pendingKey)
  }

  static func consumePending() -> [String: Any]? {
    let value = UserDefaults.standard.dictionary(forKey: pendingKey)
    UserDefaults.standard.removeObject(forKey: pendingKey)
    return value
  }
}

/// Dispara o alerta direto na API (POST /alerts/start, confirmação, um ponto de GPS), sem depender do JS.
/// Usado pelo App Intent da Siri / Atalhos / Toque traseiro / Botão de Ação e pelo módulo JS.
public enum QuickSosRunner {
  public static let didTriggerNotification = Notification.Name("QuickSosDidTrigger")

  private static let retryDelaysNs: [UInt64] = [0, 2_000_000_000, 5_000_000_000]

  public static func fire(source: String) async -> QuickSosOutcome {
    let outcome = await send(source: source)
    QuickSosStorage.setPending(outcome)
    // Confirma (vibração) assim que o alerta existe; o GPS vai depois, sem atrasar.
    await QuickSosFeedback.deliver(outcome)
    await MainActor.run {
      NotificationCenter.default.post(name: didTriggerNotification, object: nil, userInfo: outcome.dictionary)
    }
    if let alertId = outcome.alertId, outcome.status == "sent" || outcome.status == "already_active",
      let session = QuickSosStorage.session()
    {
      await sendLocation(session: session, alertId: alertId)
    }
    return outcome
  }

  private static func send(source: String) async -> QuickSosOutcome {
    if QuickSosStorage.testMode {
      return QuickSosOutcome(status: "test", source: source)
    }
    guard let session = QuickSosStorage.session() else {
      return QuickSosOutcome(status: "no_session", source: source, message: "Sessão não encontrada")
    }

    var lastStatus = 0
    for delay in retryDelaysNs {
      if delay > 0 { try? await Task.sleep(nanoseconds: delay) }
      let (status, body) = await http("POST", "\(session.apiBaseUrl)/alerts/start", session.accessToken, ["mode": "discreet"])
      lastStatus = status
      switch status {
      case 200, 201:
        if let alert = body?["alert"] as? [String: Any], let id = alert["id"] as? String {
          return QuickSosOutcome(status: "sent", source: source, alertId: id)
        }
      case 409:
        let (_, active) = await http("GET", "\(session.apiBaseUrl)/alerts/active", session.accessToken, nil)
        let id = (active?["alert"] as? [String: Any])?["id"] as? String
        return QuickSosOutcome(status: "already_active", source: source, alertId: id)
      case 401, 403:
        return QuickSosOutcome(status: "no_session", source: source, message: "Sessão expirada")
      case 400..<500:
        return QuickSosOutcome(status: "failed", source: source, message: "HTTP \(status)")
      default:
        continue  // rede (0) ou 5xx: tenta de novo
      }
    }
    let reason = lastStatus == 0 ? "Sem conexão com o servidor" : "HTTP \(lastStatus)"
    return QuickSosOutcome(status: "failed", source: source, message: reason)
  }

  private static func http(
    _ method: String, _ urlString: String, _ token: String, _ body: [String: Any]?
  ) async -> (Int, [String: Any]?) {
    guard let url = URL(string: urlString) else { return (0, nil) }
    var request = URLRequest(url: url, timeoutInterval: 10)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    }
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      return (status, json)
    } catch {
      return (0, nil)
    }
  }

  private static func sendLocation(session: QuickSosStorage.Session, alertId: String) async {
    guard let location = await OneShotLocation.fetch() else { return }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    // A API recusa capturedAt anterior ao início do alerta (-2 min): posição antiga vai
    // com o horário do disparo.
    let now = Date()
    let captured =
      location.timestamp > now || now.timeIntervalSince(location.timestamp) > 90
      ? now : location.timestamp
    var body: [String: Any] = [
      "lat": location.coordinate.latitude,
      "lng": location.coordinate.longitude,
      "capturedAt": formatter.string(from: captured),
    ]
    if location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 50_000 {
      body["accuracy"] = location.horizontalAccuracy
    }
    if location.speed >= 0 && location.speed <= 400 { body["speed"] = location.speed }
    if location.course >= 0 && location.course <= 360 { body["heading"] = location.course }
    _ = await http("POST", "\(session.apiBaseUrl)/alerts/\(alertId)/location", session.accessToken, body)
  }
}

/// Um único fix de GPS com timeout. Usa a última posição se for recente (< 2 min).
final class OneShotLocation: NSObject, CLLocationManagerDelegate {
  private static let maxAge: TimeInterval = 120
  private static let timeoutNs: UInt64 = 10_000_000_000

  private var manager: CLLocationManager?
  private var continuation: CheckedContinuation<CLLocation?, Never>?
  private var retained: OneShotLocation?

  static func fetch() async -> CLLocation? {
    await withCheckedContinuation { (cont: CheckedContinuation<CLLocation?, Never>) in
      DispatchQueue.main.async {
        let request = OneShotLocation()
        request.start(cont)
      }
    }
  }

  private func start(_ cont: CheckedContinuation<CLLocation?, Never>) {
    continuation = cont
    retained = self
    let manager = CLLocationManager()
    self.manager = manager
    let status: CLAuthorizationStatus
    if #available(iOS 14.0, *) {
      status = manager.authorizationStatus
    } else {
      status = CLLocationManager.authorizationStatus()
    }
    guard status == .authorizedAlways || status == .authorizedWhenInUse else {
      finish(nil)
      return
    }
    if let cached = manager.location, -cached.timestamp.timeIntervalSinceNow < Self.maxAge {
      finish(cached)
      return
    }
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    manager.requestLocation()
    DispatchQueue.main.asyncAfter(deadline: .now() + .nanoseconds(Int(Self.timeoutNs))) { [weak self] in
      self?.finish(self?.manager?.location)
    }
  }

  private func finish(_ location: CLLocation?) {
    guard let cont = continuation else { return }
    continuation = nil
    manager?.delegate = nil
    manager = nil
    retained = nil
    cont.resume(returning: location)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    finish(locations.last)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    finish(manager.location)
  }
}
