# Rodar o ProtectHer localmente

## Pré-requisitos

- Node.js LTS (20+ recomendado)
- pnpm 9 (`corepack enable` / `npm i -g pnpm`)
- **PostgreSQL 16+** acessível via `DATABASE_URL`

## Banco de dados (Sprint 1–2)

### Opção A — Docker

```bash
docker run --name protecther-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=protecther -p 5432:5432 -d postgres:16
```

String de conexão típica:

`postgresql://postgres:postgres@127.0.0.1:5432/protecther`

### Migrações

Na raiz do monorepo:

```bash
cp apps/api/.env.example apps/api/.env
# Edite JWT_SECRET (mín. 16 caracteres) e DATABASE_URL

pnpm --filter protecther-api db:migrate
```

Ou, a partir de `apps/api`:

```bash
pnpm db:migrate
```

Inclui migrações versionadas em `apps/api/drizzle/` (alertas, localizações, **Sprint 3.1**: tokens de push e auditoria de envio). Após atualizar o repositório, rode `db:migrate` de novo se novas migrações forem adicionadas.

### Seed opcional (dev)

Cria `alice@example.com` e `bob@example.com` com a mesma senha (`SEED_PASSWORD` ou padrão `SeedPass123!`):

```bash
pnpm --filter protecther-api db:seed
```

## Instalação

```bash
pnpm install
```

## API

```bash
pnpm dev:api
```

- Variáveis: ver `apps/api/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_SECONDS`, `INVITE_TTL_HOURS`, `NODE_ENV`).
- Endpoints: `docs/API.md`.
- Em **development**, convites retornam `devInvitationToken` na criação para teste ponta a ponta.

## Mobile

```bash
pnpm dev:mobile
```

Configure `apps/mobile/.env` com `EXPO_PUBLIC_API_URL` (veja `.env.example` no mobile).

- **Android Emulator**: `http://10.0.2.2:3000`
- **Dispositivo na LAN**: `http://<IP-da-sua-máquina>:3000`

## Fluxo rápido (Sprint 1)

1. Subir Postgres + migrar + `pnpm dev:api`.
2. Registrar duas contas (ou usar seed + senha conhecida).
3. Com a **titular**, criar convite para o email da **convidada**.
4. Copiar `devInvitationToken` (apenas dev).
5. Logar como **convidada** e aceitar o token na tela de contatos.
6. Atualizar lista: titular vê contato em `asOwner`; convidada vê titular em `asContact`.

## Fluxo rápido (Sprint 2 — SOS)

1. Com a **titular** logada: **SOS** → iniciar alerta (visível ou discreto).
2. Tela **Alerta ativo**: cancelar com ou sem PIN (PIN não vazio ⇒ coação / `riskLevel` alto no backend).
3. Com a **contato** logada: **Alertas das titulares** para ver o feed de alertas ativos dos vínculos ativos.

## Scripts úteis (raiz)

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | API + mobile |
| `pnpm build` | Pacotes + build da API |
| `pnpm typecheck` | `pnpm -r typecheck`: pacotes `contracts` e `shared` rodam `tsc` (atualiza `dist`); API e mobile rodam `tsc --noEmit`. Scripts em `apps/*` não chamam `pnpm` (adequado ao Windows/Corepack). |
| `pnpm lint` | Biome no repositório |
| `pnpm format` | Biome format |

### Windows / Corepack

Na raiz do monorepo:

```bash
corepack pnpm -C C:/src/pi4semestre/protecther install
corepack pnpm -C C:/src/pi4semestre/protecther -r typecheck
corepack pnpm -C C:/src/pi4semestre/protecther lint
```

## Healthcheck (Sprint 0)

`GET /health` continua disponível para smoke tests.

---

## Sprint 3.1 — Checklist manual (fluxo crítico)

Pré-requisitos: API migrada, `JWT_SECRET` válido; em **produção**, `FIREBASE_SERVICE_ACCOUNT_JSON` preenchido para push real (sem isso, envios são registrados como falha `PROVIDER_NOT_CONFIGURED`).

1. **Titular inicia alerta** — SOS → alerta visível ou discreto; nos logs da API deve aparecer `telemetry: alert_started` e tentativas de push (`push_sent` / `push_failed` conforme tokens).
2. **Contato recebe push** — contato com app instalado (build nativo ou dev client com notificações), logado, com permissão de notificação; token registrado após login.
3. **Contato abre detalhe e vê trilha** — Alertas das titulares → detalhe; pontos aparecem conforme ingestão.
4. **Titular em background** — com permissão **“Sempre”** / background location concedida, minimizar o app; verificar que pontos continuam em `GET /alerts/:id/locations` (ou logs `location_point_sent` no mobile em dev).
5. **Rede off/on** — modo avião curto na titular; ao voltar, fila local deve drenar (telemetria `location_queue_*` no console em `__DEV__`).
6. **ACK** — contato confirma no app; escalonamento não deve mais disparar para esse alerta.
7. **Sem ACK** — reduzir temporariamente `ALERT_ESCALATION_NO_ACK_MINUTES` e `ALERT_ESCALATION_INTERVAL_MS` no `.env` da API para teste; após a janela, verificar `telemetry: escalation_triggered` e segundo push de prioridade alta.

### Testes automatizados (API)

Na pasta `apps/api`:

```bash
pnpm test
```

`vitest` usa `DATABASE_URL` fictícia nos testes apenas para carregar módulos; os testes de integração atuais validam shell de autenticação (401) sem acessar o banco.

---

## Limitações conhecidas por plataforma (localização / push)

- **Android 10+**: localização em background exige permissão dedicada e, em builds recentes, serviço em primeiro plano (o app configura `foregroundService` no `startLocationUpdatesAsync` quando disponível no Expo).
- **iOS**: background location requer capacidade **Location updates** e permissão “Sempre”; o sistema pode limitar frequência em background e exibir indicador de barra de status.
- **iOS + FCM**: o backend envia via Firebase; tokens do `expo-notifications` no iOS podem ser de APNs — entrega via FCM pode exigir configuração adicional do app Firebase (gap documentado; Android FCM é o caminho principal nesta sprint).
- **Expo Go**: TaskManager / notificações podem ter comportamento reduzido; validação final em **development build** ou release.
