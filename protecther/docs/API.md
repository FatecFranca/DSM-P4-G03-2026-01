# ProtectHer API — Sprint 1–2

Base URL (local): `http://localhost:3000` (ou `EXPO_PUBLIC_API_URL` no mobile).

Autenticação: header `Authorization: Bearer <accessToken>` nas rotas `/emergency/*` e `/alerts/*`.

Erros comuns: corpo `{ "error": { "code": string, "message": string } }`.

---

## `GET /health`

Público. Resposta conforme `HealthResponseSchema` em `@protecther/contracts`.

---

## `POST /auth/register`

**Body**

```json
{
  "name": "Maria Silva",
  "email": "maria@example.com",
  "password": "supersecret1"
}
```

**201** — `AuthSuccessResponse`

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresInSeconds": 604800,
  "user": {
    "id": "uuid",
    "name": "Maria Silva",
    "email": "maria@example.com",
    "createdAt": "2026-03-24T12:00:00.000Z"
  }
}
```

**409** — email já cadastrado (`EMAIL_IN_USE`).

---

## `POST /auth/login`

Rate limit: **5 requisições / minuto / IP** (ajustável via plugin).

**Body**

```json
{
  "email": "maria@example.com",
  "password": "supersecret1"
}
```

**200** — mesmo formato que registro (`AuthSuccessResponse`).

**401** — credenciais inválidas (`INVALID_CREDENTIALS`).

---

## `POST /emergency/invites`

Requer JWT. Apenas a titular cria convites.

**Body**

```json
{
  "targetEmail": "convidada@example.com"
}
```

**201** — `CreateInviteResponse`

```json
{
  "inviteId": "uuid",
  "expiresAt": "2026-03-27T12:00:00.000Z",
  "devInvitationToken": "<token-base64url>"
}
```

`devInvitationToken` **só existe** quando `NODE_ENV` é `development` ou `test` (teste manual sem provedor de email).

**400** — auto-convite (`SELF_INVITE`).

**409** — vínculo ativo já existe (`CONTACT_EXISTS`) ou convite pendente duplicado (`INVITE_PENDING`).

---

## `POST /emergency/invites/:token/accept`

Requer JWT. O email da usuária autenticada (normalizado) deve ser **igual** ao `target_email` do convite.

**Body** (pode ser `{}`).

**200** — `AcceptInviteResponse`

```json
{
  "link": {
    "id": "uuid",
    "status": "active",
    "createdAt": "2026-03-24T12:05:00.000Z",
    "owner": { "id": "…", "name": "…", "email": "…", "createdAt": "…" },
    "contact": { "id": "…", "name": "…", "email": "…", "createdAt": "…" }
  }
}
```

**403** — conta atual não pode aceitar este convite (`INVITE_CANNOT_ACCEPT`). Mensagem genérica (não expõe se o email bate ou não).

**404** — convite indisponível ou expirado (`INVITE_UNAVAILABLE`). Mesmo código para token inválido, expirado ou já utilizado, para reduzir vazamento de informação.

**409** — vínculo duplicado ao aceitar (`CONTACT_EXISTS`).

---

## `GET /emergency/contacts`

Requer JWT.

**200** — `ListContactsResponse`

```json
{
  "asOwner": [
    {
      "id": "uuid",
      "status": "active",
      "createdAt": "2026-03-24T12:05:00.000Z",
      "contact": {
        "id": "uuid",
        "name": "Ana",
        "email": "ana@example.com",
        "createdAt": "…"
      }
    }
  ],
  "asContact": [
    {
      "id": "uuid",
      "status": "active",
      "createdAt": "2026-03-24T12:05:00.000Z",
      "owner": {
        "id": "uuid",
        "name": "Maria",
        "email": "maria@example.com",
        "createdAt": "…"
      }
    }
  ]
}
```

- `asOwner`: pessoas que **você** adicionou como contato de emergência.
- `asContact`: titulares que **você** aceitou como contato delas.

---

## Sprint 2 — Alertas (SOS)

Regras principais:

- Uma usuária pode ter **no máximo um alerta com `status: active`** (índice único parcial no banco).
- Emails em convites e cadastro são **normalizados** (trim + lowercase) antes de persistir e comparar.
- Telemetria mínima (logs estruturados, sem PII): `alert_started`, `alert_cancel_requested`, `alert_cancel_duress`, `alert_feed_viewed` (ver mensagens de log com campo `telemetry`).
- Transições relevantes são gravadas em `alert_audit_events` (eventos `started`, `cancelled`, `cancelled_duress`).

### `POST /alerts/start`

**Body**

```json
{ "mode": "visible" }
```

ou `"discreet"`.

**201** — `StartAlertResponse` (`alert` conforme `AlertPublicSchema` em `@protecther/contracts`).

**409** — já existe alerta ativo (`ALERT_ALREADY_ACTIVE`).

### `GET /alerts/active`

**200** — `ActiveAlertResponse`

```json
{ "alert": null }
```

ou `{ "alert": { … } }` com o alerta ativo da titular autenticada.

### `GET /alerts/contacts-feed`

Somente contatos de emergência com vínculo **`active`** enxergam titulares com alerta **ativo**.

**200** — `ContactsAlertFeedResponse`: lista de `{ owner, alert }` (subconjunto do alerta, sem metadados de cancelamento).

### `POST /alerts/:id/cancel`

Apenas a **dona** do alerta pode cancelar. Respostas **404** `ALERT_NOT_FOUND` tanto para id inexistente quanto para alerta de outra usuária (evita enumeração).

**Body** (opcional)

```json
{ "pin": "qualquer-valor-não-vazio" }
```

Se `pin` estiver presente e não vazio (após trim), o cancelamento é tratado como **coação**: o alerta passa a `closed`, a usuária vê o fim do incidente, mas `riskLevel` é gravado como **`high`** e `cancelReason` como `duress`.

**200** — `CancelAlertResponse` com o alerta já encerrado.

**409** — alerta já não está ativo (`ALERT_NOT_ACTIVE`).

---

## Sprint 3.1 — Dispositivo e push

### `POST /devices/push-token`

Requer JWT. Registra ou atualiza o token de push do dispositivo autenticado (FCM no Android; iOS envia token nativo — ver limitações em `docs/ARCHITECTURE.md`).

**Body** — `RegisterPushTokenRequest`

```json
{ "platform": "android", "token": "<fcm-or-native-token>" }
```

`platform`: `ios` | `android` | `web`.

**200** — `{ "ok": true }`

### Fluxo de push (alerta)

1. Contatos ativos registram token via `POST /devices/push-token`.
2. Ao **`POST /alerts/start`**, a API envia push para todos os tokens **ativos** dos contatos da titular (`push_delivery_kind: alert_started`, prioridade normal).
3. No **escalonamento** (job periódico, sem ACK dentro da janela configurada), a API reenvia push com prioridade **alta** (`push_delivery_kind: escalation`).
4. Cada tentativa gera linha em `push_delivery_events` (sucesso/falha, código de erro do provedor quando houver) para auditoria.

Payload `data` do FCM inclui `alertId` e `kind` (`alert_started` | `escalation`) — sem PII.

### Localização — validação extra

- `POST /alerts/:id/location`: rejeita `capturedAt` que **retroceda** além de `ALERT_LOCATION_CAPTURE_REGRESSION_MS` (padrão 180000 ms = 3 min) em relação ao último ponto já armazenado para o mesmo alerta (`VALIDATION_ERROR`).
- Rate limit por usuário permanece configurável via `ALERT_LOCATION_RATE_MAX_PER_MINUTE`.
