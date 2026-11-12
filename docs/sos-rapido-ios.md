# SOS rápido no iOS

No iPhone o alerta pode ser enviado sem abrir o app por um App Intent ("Pedir ajuda"), usado
pela Siri, pelo app Atalhos, pelo Toque traseiro e pelo Botão de Ação (iOS 17+). O envio é
nativo (`modules/quick-sos/ios/QuickSosRunner.swift`): cria o alerta na API, confirma com
vibração e manda um ponto de GPS.

## Frases da Siri (sem configurar nada)

- Frases prontas: `modules/quick-sos/app-intents/QuickSosIntents.swift`, espelhadas em
  `siriPhrases()` (`src/quickSos/quickSos.ts`). Ex.: "Me ajuda no ProtectHer", "SOS no ProtectHer".
- A Apple exige o nome do app na frase. Para quem fala português, o app aceita apelidos
  (`src/quickSos/siriNicknames.json` → `INAlternativeAppNames` no Info.plist): "Me ajuda no
  Proteger", "SOS no Proteger".
- "SOS" sozinho não funciona: a Siri responde com a definição da sigla.

## Frase curta, Toque traseiro e Botão de Ação

Dependem de a usuária criar um atalho no app Atalhos com a ação "Pedir ajuda" (passo a passo na
tela SOS rápido). O nome do atalho deve ter duas ou mais palavras.

## Confirmação por vibração

- App aberto: háptico direto.
- App fechado: notificação local "Atalho executado" com som mudo (`quick_sos_silence.wav`), que
  faz o iPhone vibrar. Depende das notificações permitidas.
- Falha no envio não vibra.

## O que precisa de aparelho físico para validar

Siri (voz, incluindo os apelidos), Toque traseiro, Botão de Ação e a vibração não podem ser
exercitados no simulador.
