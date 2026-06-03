/**
 * Atualiza apps/api/.env com FIREBASE_SERVICE_ACCOUNT_JSON (uma linha) sem imprimir o segredo.
 * Uso: node scripts/apply-firebase-env.mjs <caminho-do-json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Uso: node scripts/apply-firebase-env.mjs <caminho-do-json>");
  process.exit(1);
}

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(apiRoot, ".env");
const oneLine = JSON.stringify(JSON.parse(readFileSync(jsonPath, "utf8")));

let envText = readFileSync(envPath, "utf8");
const firebaseLine = `FIREBASE_SERVICE_ACCOUNT_JSON=${oneLine}`;

if (/^FIREBASE_SERVICE_ACCOUNT_JSON=.*$/m.test(envText)) {
  envText = envText.replace(
    /^FIREBASE_SERVICE_ACCOUNT_JSON=.*$/m,
    firebaseLine,
  );
} else {
  envText = `${envText.replace(/\s*$/, "")}\n${firebaseLine}\n`;
}

if (!/^PUSH_USE_FCM_IN_DEV=/m.test(envText)) {
  envText = `${envText.replace(/\s*$/, "")}\nPUSH_USE_FCM_IN_DEV=true\n`;
} else {
  envText = envText.replace(
    /^PUSH_USE_FCM_IN_DEV=.*$/m,
    "PUSH_USE_FCM_IN_DEV=true",
  );
}

writeFileSync(envPath, envText, "utf8");
console.log("OK: apps/api/.env atualizado (FIREBASE_SERVICE_ACCOUNT_JSON + PUSH_USE_FCM_IN_DEV).");
