/**
 * Gera a linha FIREBASE_SERVICE_ACCOUNT_JSON para colar no apps/api/.env
 * Uso: node scripts/print-firebase-env-line.mjs caminho/para/chave.json
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error(
    "Uso: node scripts/print-firebase-env-line.mjs <caminho-do-json-da-service-account>",
  );
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
JSON.parse(raw);
const oneLine = JSON.stringify(JSON.parse(raw));
console.log(`FIREBASE_SERVICE_ACCOUNT_JSON=${oneLine}`);
console.log("PUSH_USE_FCM_IN_DEV=true");
