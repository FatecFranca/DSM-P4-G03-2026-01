import ExpoModulesCore
import Foundation

/// SOS rápido no iOS: o gatilho é o App Intent "Pedir ajuda" (Siri, app Atalhos, Toque traseiro,
/// Botão de Ação), adicionado ao target do app pelo plugin plugins/withQuickSos.js.
/// Este módulo espelha a sessão para o Keychain e repassa os disparos ao JS.
public final class QuickSosModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("QuickSos")

    Events("onTrigger")

    OnStartObserving {
      self.removeObserver()
      self.observer = NotificationCenter.default.addObserver(
        forName: QuickSosRunner.didTriggerNotification, object: nil, queue: .main
      ) { [weak self] note in
        self?.sendEvent("onTrigger", (note.userInfo as? [String: Any]) ?? [:])
      }
    }

    OnStopObserving {
      self.removeObserver()
    }

    Function("getCapabilities") { () -> [String: Bool] in
      var appIntents = false
      if #available(iOS 17.0, *) { appIntents = true }
      return [
        "powerButton": false,
        "quickTile": false,
        "addTilePrompt": false,
        "appIntents": appIntents,
      ]
    }

    AsyncFunction("setSession") { (apiBaseUrl: String, accessToken: String) in
      QuickSosStorage.setSession(apiBaseUrl: apiBaseUrl, accessToken: accessToken)
    }

    AsyncFunction("clearSession") {
      QuickSosStorage.clearSession()
    }

    AsyncFunction("getSettings") { () -> [String: Any] in
      Self.settings()
    }

    AsyncFunction("setSettings") { (patch: [String: Any]) -> [String: Any] in
      if let testMode = patch["testMode"] as? Bool {
        QuickSosStorage.testMode = testMode
      }
      return Self.settings()
    }

    AsyncFunction("consumePendingTrigger") { () -> [String: Any]? in
      QuickSosStorage.consumePending()
    }

    AsyncFunction("triggerNow") { () async -> Bool in
      _ = await QuickSosRunner.fire(source: "app")
      return false
    }

    AsyncFunction("cancelCountdown") { () -> Bool in
      false
    }
  }

  private static func settings() -> [String: Any] {
    [
      "powerButtonEnabled": false,
      "countdownSeconds": 0,
      "testMode": QuickSosStorage.testMode,
      "serviceRunning": false,
    ]
  }

  private func removeObserver() {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
    }
    observer = nil
  }
}
