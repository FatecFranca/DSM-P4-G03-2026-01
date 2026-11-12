# SOS rápido no iOS

No iPhone o alerta pode ser enviado sem abrir o app por um App Intent ("Pedir ajuda"), usado
pela Siri, pelo app Atalhos, pelo Toque traseiro e pelo Botão de Ação (iOS 17+). O envio é
nativo (`modules/quick-sos/ios/QuickSosRunner.swift`): cria o alerta na API, confirma com
vibração e manda um ponto de GPS.

## Frases da Siri

- Frases prontas: `modules/quick-sos/app-intents/QuickSosIntents.swift`, espelhadas em
  `siriPhrases()` (`src/quickSos/quickSos.ts`). Ex.: "Ativar SOS no ProtectHer".
- A Apple exige o nome do app na frase. O app também registra apelidos
  (`src/quickSos/siriNicknames.json` → `INAlternativeAppNames` no Info.plist).
- "SOS" sozinho não funciona: a Siri responde com a definição da sigla.
- Frases com "me ajuda", "preciso de ajuda" ou "socorro" não funcionam: a Siri trata como pedido
  de socorro dela mesma (oferece ligar para a emergência) e não repassa ao app.

### Primeira vez: ensaio guiado

Na primeira vez que alguém fala uma frase do app, o iOS pergunta se pode ativar os atalhos
("Ativar"). Não existe API para o app fazer isso sozinho. A tela SOS rápido tem o cartão
"Ativar a Siri para este app" (`src/quickSos/SiriRehearsalCard.tsx`): liga o modo teste, mostra a
frase, espera o disparo da Siri chegar e devolve o modo teste ao que era. Assim a pergunta do
sistema acontece num ensaio, sem enviar alerta, e não numa emergência.

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
