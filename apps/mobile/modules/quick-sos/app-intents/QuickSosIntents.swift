import AppIntents
// `internal`: o ExpoModulesProvider gerado importa os módulos assim; sem o mesmo nível de
// acesso o Swift recusa ("ambiguous implicit access level for import").
internal import QuickSos

// Copiado para o target do app por plugins/withQuickSos.js (o processador de metadados
// de App Intents só enxerga intents compilados no próprio app, não em pods estáticos).

/// "Pedir ajuda": envia o alerta sem abrir o app. Aparece para a Siri, no app Atalhos, no
/// Toque traseiro (via atalho) e no Botão de Ação (iPhone 15 Pro ou mais novo).
@available(iOS 17.0, *)
struct TriggerQuickSosIntent: AppIntent {
  static let title: LocalizedStringResource = "Pedir ajuda"
  static let description = IntentDescription(
    "Envia o alerta de SOS para seus contatos de emergência sem abrir o app."
  )
  static let openAppWhenRun: Bool = false
  // Funciona com o iPhone bloqueado: numa emergência não dá para pedir Face ID.
  static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let outcome = await QuickSosRunner.fire(source: "app_intent")
    switch outcome.status {
    case "sent", "already_active":
      // Resposta neutra de propósito: a Siri fala em voz alta.
      return .result(dialog: "Pronto.")
    case "test":
      return .result(dialog: "Teste concluído. Nenhum alerta foi enviado.")
    case "no_session":
      return .result(dialog: "Abra o app e entre na sua conta para usar este atalho.")
    default:
      return .result(dialog: "Não consegui concluir. Abra o app e tente de novo.")
    }
  }
}

@available(iOS 17.0, *)
struct QuickSosAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TriggerQuickSosIntent(),
      phrases: [
        "Pedir ajuda no \(.applicationName)",
        "SOS no \(.applicationName)",
        "Ativar SOS no \(.applicationName)",
        "Emergência no \(.applicationName)",
        "Preciso de ajuda no \(.applicationName)",
        "Me ajuda no \(.applicationName)",
        "Socorro no \(.applicationName)",
      ],
      shortTitle: "Pedir ajuda",
      systemImageName: "exclamationmark.shield.fill"
    )
  }
}
