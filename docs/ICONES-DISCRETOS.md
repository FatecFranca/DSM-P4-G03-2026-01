# Ícones discretos (disfarces do app)

A usuária pode escolher, em **Início → Aparência**, como o app aparece na tela inicial
(ícone + nome). Padrão de fábrica: **Notas**. O nome "ProtectHer" não aparece no launcher.

| Chave | Nome no launcher |
|---|---|
| `notes` (padrão) | Notas |
| `calculator` | Calculadora |
| `weather` | Clima |
| `calendar` | Agenda |
| `cycle` | Meu Ciclo |
| `clock` | Relógio |

## Como funciona

| Peça | Onde |
|---|---|
| Catálogo (chaves, nomes, cores) | `apps/mobile/src/appearance/discreetIcons.json` |
| Artes (geradas) | `apps/mobile/assets/discreet-icons/<chave>/` |
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

## Limites (também mostrados na tela)

- O nome em **Configurações → Apps** é o `name` do app (`Notas`), não o do disfarce escolhido.
- Histórico da loja de apps não é afetado.
- Ao abrir o app, a interface continua sendo a do ProtectHer.

## Adicionar ou alterar um disfarce

1. Edite `discreetIcons.json` (e `DiscreetIconKey` em `src/appearance/discreetIcons.ts`).
2. Adicione o desenho em `scripts/generate-discreet-icons.py` (`GLYPHS`) e o `require` em
   `src/appearance/discreetIconPreviews.ts`.
3. `cd apps/mobile && python scripts/generate-discreet-icons.py` e commite `assets/`.
4. Requer **novo build nativo** (`expo prebuild` / `expo run:android|ios` / EAS). Não funciona no Expo Go.
   Se a pasta `android/` já existe, rode `expo prebuild --platform android` para aplicar o plugin.
