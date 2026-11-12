import AudioToolbox
import Foundation
import UIKit
import UserNotifications

/// Confirmação sem olhar a tela: o aparelho vibra quando o alerta foi enviado.
///
/// - App aberto: háptico direto.
/// - App fechado / em segundo plano (Siri, Atalhos, Toque traseiro, Botão de Ação): o iOS não
///   deixa um app em segundo plano vibrar sozinho, então a vibração vem de uma notificação
///   local com um som mudo (o aparelho vibra, mas não toca nada). Depende de as notificações
///   do app estarem permitidas. Falha não vibra: só mostra o aviso.
enum QuickSosFeedback {
  private static let notificationId = "quick-sos-result"
  private static let silentSound = "quick_sos_silence"
  private static let silentSoundExtension = "wav"

  static func deliver(_ outcome: QuickSosOutcome) async {
    let isActive = await MainActor.run { () -> Bool in
      let active = UIApplication.shared.applicationState == .active
      if active {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(outcome.succeeded ? .success : .error)
      }
      if outcome.succeeded {
        // Vibração longa. Em segundo plano o sistema costuma ignorar; a notificação cobre.
        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
      }
      return active
    }
    if !isActive {
      await notify(outcome)
    }
  }

  private static func notify(_ outcome: QuickSosOutcome) async {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    else { return }

    // Textos neutros de propósito: aparecem na tela bloqueada.
    let content = UNMutableNotificationContent()
    switch outcome.status {
    case "sent", "already_active":
      content.title = "Atalho executado"
      content.body = "Toque para acompanhar"
    case "test":
      content.title = "Teste do atalho"
      content.body = "Gesto reconhecido. Nenhum alerta foi enviado."
    default:
      content.title = "Não foi possível concluir"
      content.body = "Toque para abrir o app e tentar de novo"
    }
    // Sem o arquivo mudo no bundle o iOS tocaria o som padrão: melhor ficar sem vibração.
    if outcome.succeeded,
      Bundle.main.url(forResource: silentSound, withExtension: silentSoundExtension) != nil
    {
      content.sound = UNNotificationSound(
        named: UNNotificationSoundName("\(silentSound).\(silentSoundExtension)")
      )
    }
    let request = UNNotificationRequest(identifier: notificationId, content: content, trigger: nil)
    try? await center.add(request)
  }
}
