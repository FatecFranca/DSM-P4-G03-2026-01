# Ícones discretos (disfarces do app)

O app nasce com o **ícone e o nome originais** (ProtectHer). Só se a usuária sentir necessidade de
deixá-lo mais discreto ela escolhe, em **Início → Aparência**, um disfarce (ícone + nome) e pode
voltar ao original a qualquer momento.

| Chave | Nome no launcher |
|---|---|
| `original` (padrão) | ProtectHer (ícone original do app) |
| `notes` | Notas |
| `calculator` | Calculadora |
| `weather` | Clima |
| `calendar` | Agenda |
| `cycle` | Meu Ciclo |
| `clock` | Relógio |

## Como funciona

| Peça | Onde |
|---|---|
| Catálogo (chaves, nomes, cores) | `apps/mobile/src/appearance/discreetIcons.json` |
| Arte do `original` | identidade do app (degradê rosa + logo `assets/login/Icon.png` + "ProtectHer" em Italianno), gerada pelo mesmo script; também escreve `assets/icon.png` e `assets/android-icon-*.png` |
| Artes dos disfarces (geradas) | `apps/mobile/assets/discreet-icons/<chave>/` |
| Gerador das artes | `apps/mobile/scripts/generate-discreet-icons.py` (Pillow) |
| Config plugin (Android + iOS) | `apps/mobile/plugins/withDiscreetIcons.js` |
| Módulo nativo (troca em runtime) | `apps/mobile/modules/discreet-icon/` (Kotlin + Swift) |
| Tela | `apps/mobile/src/screens/AppearanceScreen.tsx` |

- **Android:** o plugin remove o `LAUNCHER` da `MainActivity` e cria um `<activity-alias>` por disfarce
  (`<pacote>.discreet.<chave>`), com ícone adaptativo, monocromático (ícones temáticos) e legado.
  Só o padrão nasce habilitado; o módulo habilita o escolhido e desabilita os demais (`DONT_KILL_APP`).
- **iOS:** o ícone principal (`AppIcon`, de `assets/icon.png`) é o disfarce padrão; os demais são
  *alternate icons* (`CFBundleAlternateIcons` + PNGs no bundle). O iOS exibe um aviso do sistema na troca.
- **Prévia nos apps recentes:** `setPrivacyScreen` — Android 13+ oculta só a miniatura
  (`setRecentsScreenshotEnabled`); Android ≤ 12 usa `FLAG_SECURE`; iOS cobre a janela ao perder o foco.

## Ocultar o app

- **Android:** em **Aparência → Ocultar o app**, ou segurando o ícone e tocando em **Ocultar app**
  (static shortcut → deep link `protecther://appearance?hide=1` → confirmação). Ocultar = todos os
  `activity-alias` desabilitados (o app some do launcher e da lista de apps). O módulo guarda o
  último disfarce para restaurá-lo.
- **Voltar (principal):** tile **ProtectHer** nas Configurações Rápidas (`OpenAppTileService`, escudo).
  Ao ocultar, o app pede ao sistema para adicioná-lo (`requestAddQuickTile`, Android 13+; há também o
  botão "Adicionar atalho nas Configurações Rápidas"). Se o tile não foi adicionado, o app avisa e pede
  uma segunda confirmação. O tile pede desbloqueio e abre o app; depois, em Aparência, **Mostrar ícone de novo**.
  Em Android < 13 o usuário adiciona manualmente (lápis → arrastar).
- **Voltar (extra):** discar `*#*#7743#*#*` (`secretCode` em `discreetIcons.json`; `SecretCodeReceiver`
  reabilita o ícone). **Não é confiável:** o Google Phone (Pixel/emulador) ignora códigos secretos, e
  `Telephony.SECRET_CODE` é broadcast protegido (nem `adb shell am broadcast` o envia).
- **Não use um alias `CATEGORY_INFO` "de recuperação":** o Pixel Launcher lista apps só com `INFO`, e o
  ícone reaparece (testado). Com todos os aliases desabilitados o app fica sem `LAUNCHER` nem `INFO`
  (sem botão "Abrir" em Configurações → Apps). O Pixel Launcher pode manter um resíduo em cache na dock,
  mas tocar nele abre só "Informações do app".
- **iOS:** um app não consegue se ocultar nem acionar o "Ocultar e exigir Face ID" do sistema (iOS 18+,
  segurar o ícone). A tela Aparência mostra o passo a passo.

## Limites (também mostrados na tela)

- O nome em **Configurações → Apps** é o `name` do app (`ProtectHer`), não o do disfarce escolhido.
- Histórico da loja de apps não é afetado.
- Ao abrir o app, a interface continua sendo a do ProtectHer.

## Adicionar ou alterar um disfarce

1. Edite `discreetIcons.json` (e `DiscreetIconKey` em `src/appearance/discreetIcons.ts`).
2. Adicione o desenho em `scripts/generate-discreet-icons.py` (`GLYPHS`) e o `require` em
   `src/appearance/discreetIconPreviews.ts`.
3. `cd apps/mobile && python scripts/generate-discreet-icons.py` e commite `assets/`.
4. Requer **novo build nativo** (`expo prebuild` / `expo run:android|ios` / EAS). Não funciona no Expo Go.
   Se a pasta `android/` já existe, rode `expo prebuild --platform android` para aplicar o plugin.
