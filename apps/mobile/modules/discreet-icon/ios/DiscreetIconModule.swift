import ExpoModulesCore
import UIKit

/// Ícones alternativos (`setAlternateIconName`) + cobertura da tela ao ir para o seletor de apps.
///
/// Os arquivos PNG e o `CFBundleAlternateIcons` são gerados pelo plugin plugins/withDiscreetIcons.js.
/// O ícone principal (AppIcon) corresponde ao disfarce padrão; nome `nil` volta a ele.
public final class DiscreetIconModule: Module {
  private var observers: [NSObjectProtocol] = []
  private var cover: UIView?

  public func definition() -> ModuleDefinition {
    Name("DiscreetIcon")

    // Nome do ícone alternativo atual; nil = ícone principal (padrão).
    AsyncFunction("getActiveIcon") { (promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(UIApplication.shared.alternateIconName)
      }
    }

    // `name == nil` restaura o ícone principal. O iOS mostra um aviso do sistema na troca.
    AsyncFunction("setActiveIcon") { (name: String?, promise: Promise) in
      DispatchQueue.main.async {
        guard UIApplication.shared.supportsAlternateIcons else {
          promise.reject("ERR_UNSUPPORTED", "Este dispositivo não permite trocar o ícone do app.")
          return
        }
        UIApplication.shared.setAlternateIconName(name) { error in
          if let error {
            promise.reject("ERR_SET_ICON", error.localizedDescription)
          } else {
            promise.resolve(name)
          }
        }
      }
    }

    AsyncFunction("setPrivacyScreen") { (enabled: Bool, promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        self?.configurePrivacyScreen(enabled: enabled)
        promise.resolve(true)
      }
    }
  }

  private func configurePrivacyScreen(enabled: Bool) {
    let center = NotificationCenter.default
    observers.forEach { center.removeObserver($0) }
    observers.removeAll()
    hideCover()
    guard enabled else { return }

    observers.append(
      center.addObserver(
        forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.showCover() })
    observers.append(
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.hideCover() })
  }

  private func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private func showCover() {
    guard cover == nil, let window = keyWindow() else { return }
    let view = UIView(frame: window.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.backgroundColor = .systemBackground
    window.addSubview(view)
    cover = view
  }

  private func hideCover() {
    cover?.removeFromSuperview()
    cover = nil
  }
}
