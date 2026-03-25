# ProtectHer — arquitetura

## Visão geral

Monorepo **pnpm** com aplicativo **Expo (React Native)** e API **Fastify**. Contratos compartilhados em `@protecther/contracts` (Zod + tipos inferidos) garantem que mobile e API falem o mesmo “contrato” nos payloads de sucesso.

```
Mobile (Expo)  --HTTP+JWT-->  API (Fastify)  --Drizzle-->  PostgreSQL
        |                            |
        +---- valida com @protecther/contracts
```

## Stack

| Área | Escolha | Motivo |
|------|---------|--------|
| Monorepo | pnpm workspaces + `node-linker=hoisted` | Links `workspace:*`; Expo/Metro estável com hoisting |
| Mobile | Expo SDK 55, TypeScript, React Navigation | Fluxo multi-tela (auth + app) sem excesso de boilerplate |
| API | Fastify 5, TypeScript | Leve, plugin ecosystem (JWT, rate-limit, CORS) |
| Persistência | PostgreSQL + **Drizzle ORM** + SQL migrations (`drizzle/`) | Schema tipado, migrações versionadas, sem ORM pesado |
| Auth | `@fastify/jwt` (access JWT) | Sprint 1: estadoless; refresh tokens podem vir na Sprint 2+ |
| Senha | **bcryptjs** (custo 12) | Sem native binding; suficiente para MVP |
| Validação HTTP | Zod nos pacotes `contracts` | Uma fonte de verdade para request/response de sucesso |
| Email | Adapter `EmergencyInviteEmailSender` | Dev: log estruturado + token na resposta; prod: stub até SES/SendGrid |
| Qualidade | Biome | Lint + format unificados; pasta `drizzle/` ignorada no Biome (artefatos gerados) |

## Estrutura de pastas (relevante)

```
protecther/
├── apps/
│   ├── api/
│   │   ├── drizzle/              # migrações SQL + meta (gerado)
│   │   ├── src/
│   │   │   ├── db/               # client Drizzle, schema, migrate, seed
│   │   │   ├── routes/           # health, auth, emergency (prefix /emergency no plugin)
│   │   │   ├── services/email/   # adapters de envio
│   │   │   └── main.ts
│   │   └── .env.example
│   └── mobile/
│       └── src/
│           ├── api/              # fetch JSON tipado
│           ├── auth/             # sessão em SecureStore (JSON validado)
│           ├── navigation/
│           └── screens/
├── packages/
│   ├── contracts/                # Zod: auth + emergency + health
│   └── shared/
└── docs/
```

## Segurança (Sprint 1)

- JWT com expiração configurável (`JWT_EXPIRES_SECONDS`).
- Senha só como hash no banco; nunca retornada em JSON.
- Rate limit em `POST /auth/login` (por IP).
- Email normalizado (`trim` + `lowercase`) antes de comparar/armazenar.
- Logs de convite em dev usam **prefixo** do token, não o valor completo.
- Rotas `/emergency/*` exigem JWT; regras de negócio impedem auto-convite, aceite por email errado e duplicidade de vínculo ativo.

## Sprint 3.1 — Hardening (produção)

### Mobile

- **Localização durante alerta**: `ActiveAlertLocationSync` (raiz do app autenticado) consulta `GET /alerts/active` periodicamente e mantém:
  - `watchPositionAsync` em primeiro plano (intervalo `EXPO_PUBLIC_LOCATION_FG_INTERVAL_MS`, padrão 5s);
  - `TaskManager` + `startLocationUpdatesAsync` em segundo plano quando há permissão **always** (intervalo `EXPO_PUBLIC_LOCATION_BG_INTERVAL_MS`, padrão 15s).
- **Fila offline**: `@react-native-async-storage/async-storage`; falhas de `POST /alerts/:id/location` enfileiram ponto; flush em ordem cronológica com backoff exponencial + jitter; dedupe por `capturedAt` + coordenadas arredondadas; tamanho máximo **400** (descarta os mais antigos).
- **Gap**: sem permissão “Sempre”, apenas primeiro plano envia com a cadência alta; Expo Go pode não refletir o mesmo comportamento que development build.

### API

- **Push**: interface `PushProvider` (`services/push/`) com implementação **FCM** (`firebase-admin`) quando `FIREBASE_SERVICE_ACCOUNT_JSON` está definido em produção; caso contrário stub auditable (`PROVIDER_NOT_CONFIGURED`). Orquestração em `contactsPushOrchestrator` dispara em `POST /alerts/start` e após escalonamento.
- **Persistência**: `device_push_tokens` (upsert por `user_id` + `token`), `push_delivery_events` para auditoria.
- **Consistência**: monotonicidade de `capturedAt` por alerta (janela configurável); índices `alerts(owner_user_id, status)`, `alert_acknowledgments(alert_id)`; transação no ACK; rate limit de ingestão mantido.

### Observabilidade

- Logs estruturados `telemetry`: `first_location_ingest_ms`, `location_ingest_rejected`, `location_post_failed`, `push_sent`, `push_failed`, `push_skipped_no_tokens`, `escalation_triggered`, além dos eventos anteriores.

## Próximos passos sugeridos

- Refresh tokens / revogação por dispositivo.
- OpenAPI gerada a partir dos schemas (ou vice-versa).
- Provedor real de email + deep link com token assinado.
- APNs direto ou FCM+iOS completo quando o app estiver no Firebase iOS.
