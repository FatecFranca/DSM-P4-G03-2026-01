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

## Próximos passos sugeridos

- Refresh tokens / revogação por dispositivo.
- OpenAPI gerada a partir dos schemas (ou vice-versa).
- Provedor real de email + deep link com token assinado.
- **Sprint 2**: SOS, incidente ativo, localização em tempo real (ver prompt ao final do entregável da sprint).
