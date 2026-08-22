/**
 * Envia uma notificação de teste FCM para todos os tokens ativos de um e-mail.
 * Uso: pnpm exec tsx scripts/send-test-push.ts carlostest1@gmail.com
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { resolvePushProviderMode } from "../src/config/env.js";
import { db } from "../src/db/index.js";
import { devicePushTokens, users } from "../src/db/schema.js";
import { createFcmPushProvider } from "../src/services/push/fcmProvider.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: pnpm exec tsx scripts/send-test-push.ts <email>");
  process.exit(1);
}

async function main(): Promise<void> {
  const mode = resolvePushProviderMode();
  console.log({ pushProviderMode: mode, email });
  if (mode !== "fcm") {
    console.error(
      "API não está em modo FCM. Defina PUSH_USE_FCM_IN_DEV=true e FIREBASE_SERVICE_ACCOUNT_JSON.",
    );
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`Usuário não encontrado: ${email}`);
    process.exit(1);
  }

  const tokens = await db
    .select({
      token: devicePushTokens.token,
      platform: devicePushTokens.platform,
    })
    .from(devicePushTokens)
    .where(
      and(
        eq(devicePushTokens.userId, user.id),
        eq(devicePushTokens.active, true),
      ),
    );

  if (tokens.length === 0) {
    console.error(
      `Nenhum token ativo para ${email}. Abra o app do contato e aceite notificações.`,
    );
    process.exit(1);
  }

  const provider = createFcmPushProvider();
  const results = await provider.sendBatch(
    tokens.map((t) => ({
      token: t.token,
      title: "ProtectHer (teste)",
      body: "Se você vê isto, o FCM está chegando a este dispositivo.",
      data: { kind: "test", alertId: "00000000-0000-0000-0000-000000000000" },
      androidPriority: "high" as const,
    })),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const t = tokens[i];
    console.log({
      platform: t?.platform,
      tokenPrefix: t ? `${t.token.slice(0, 16)}…` : "?",
      ok: r?.ok,
      messageId: r?.messageId,
      errorCode: r?.errorCode,
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
