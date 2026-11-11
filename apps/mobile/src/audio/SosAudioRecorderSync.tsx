import { ALERT_AUDIO_CHUNK_MAX_DURATION_MS } from "@protecther/contracts";
import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  getActiveAlertId,
  onActiveAlertChange,
} from "../alerts/activeAlertBus";
import { useAuth } from "../auth/AuthContext";
import { logMobileTelemetry } from "../lib/telemetry";
import { canRecordInBackground, readMicPermission } from "./micPermission";
import {
  SOS_AUDIO_CHUNK_MS,
  SOS_AUDIO_MIN_CHUNK_MS,
  type SosAudioStatus,
  makeClientChunkId,
  recorderRestartDelayMs,
} from "./sosAudio";
import {
  enqueueRecordedChunk,
  flushAudioQueue,
  getAudioQueueDepth,
} from "./sosAudioQueue";
import {
  getSosAudioState,
  onSosAudioCommand,
  updateSosAudioState,
} from "./sosAudioStore";

/**
 * AAC mono em M4A, ~32 kbps: voz inteligível com ~60 KB por trecho de 15 s.
 * Mesmo contêiner nos dois sistemas para o servidor validar e o contato tocar.
 */
export const SOS_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: false,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    audioSource: "mic",
  },
  ios: {
    extension: ".m4a",
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 32_000,
  },
};

/** Fila parada sem gravação: tenta reenviar de tempos em tempos. */
const IDLE_FLUSH_INTERVAL_MS = 60_000;

/**
 * Grava o som ambiente durante um alerta ativo, em trechos de
 * `SOS_AUDIO_CHUNK_MS`, e coloca cada trecho na fila de envio para os contatos.
 *
 * - Começa sozinho quando `activeAlertBus` publica um alerta e para quando ele
 *   termina (o último trecho, mesmo curto, também é enviado).
 * - Só grava com a permissão do microfone (pedida antes, com explicação, em
 *   `MicrophoneExplanationModal`). Nunca grava fora de um alerta.
 * - Continua com a tela bloqueada / app em segundo plano (iOS: modo de fundo
 *   "audio"; Android: serviço em primeiro plano "microphone"). Os sistemas não
 *   deixam *ligar* o microfone com o app fechado: nesse caso fica aguardando o
 *   app abrir (`waiting_foreground`).
 */
export function SosAudioRecorderSync() {
  const { state, getAccessToken } = useAuth();
  const authenticated = state.status === "authenticated";
  const recorder = useAudioRecorder(SOS_RECORDING_OPTIONS);

  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

  const loopRunningRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);
  const pausedAlertsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const desiredAlertId = (): string | null => {
      if (!mountedRef.current || !authenticatedRef.current) {
        return null;
      }
      const id = getActiveAlertId();
      return id && !pausedAlertsRef.current.has(id) ? id : null;
    };

    /** Espera `ms`, mas acorda antes se `wake()` for chamado. */
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          if (wakeRef.current === done) {
            wakeRef.current = null;
          }
          resolve();
        };
        const timer = setTimeout(done, ms);
        wakeRef.current = done;
      });

    const wake = () => wakeRef.current?.();

    const setStatus = (status: SosAudioStatus, alertId: string | null) => {
      const prev = getSosAudioState();
      updateSosAudioState({
        status,
        alertId,
        chunksRecorded: prev.alertId === alertId ? prev.chunksRecorded : 0,
      });
    };

    const finishChunk = async (
      alertId: string,
      fileUri: string,
      startedAt: number,
    ) => {
      const rec = recorderRef.current;
      try {
        await rec.stop();
      } catch {
        // Interrompido pelo sistema: o arquivo pode ainda ser aproveitável.
      }
      const durationMs = Date.now() - startedAt;
      if (!fileUri || durationMs < SOS_AUDIO_MIN_CHUNK_MS) {
        return;
      }
      try {
        await enqueueRecordedChunk(fileUri, {
          alertId,
          clientChunkId: makeClientChunkId(startedAt),
          capturedAt: new Date(startedAt).toISOString(),
          durationMs: Math.min(durationMs, ALERT_AUDIO_CHUNK_MAX_DURATION_MS),
        });
        updateSosAudioState({
          chunksRecorded: getSosAudioState().chunksRecorded + 1,
        });
      } catch {
        logMobileTelemetry("audio_recording_failed", { reason: "enqueue" });
      }
      void flushAudioQueue(() => getAccessTokenRef.current());
    };

    const runLoop = async () => {
      if (loopRunningRef.current) {
        wake();
        return;
      }
      loopRunningRef.current = true;
      let audioModeOn = false;
      let failures = 0;
      let lastAlertId: string | null = null;
      try {
        for (;;) {
          const alertId = desiredAlertId();
          if (!alertId) {
            break;
          }
          lastAlertId = alertId;

          const mic = await readMicPermission();
          if (!mic.granted) {
            setStatus("needs_permission", alertId);
            break;
          }

          const rec = recorderRef.current;
          let fileUri = "";
          try {
            if (!audioModeOn) {
              const background = await canRecordInBackground();
              await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
                shouldPlayInBackground: false,
                allowsBackgroundRecording: background,
                interruptionMode: "mixWithOthers",
              });
              audioModeOn = true;
              updateSosAudioState({ foregroundOnly: !background });
            }
            if (getSosAudioState().status !== "recording") {
              setStatus("starting", alertId);
            }
            // Passar as opções cria um arquivo novo a cada trecho (no iOS,
            // sem opções o mesmo arquivo seria sobrescrito).
            await rec.prepareToRecordAsync(SOS_RECORDING_OPTIONS);
            fileUri = rec.uri ?? "";
            rec.record();
          } catch (error) {
            failures += 1;
            const foreground = AppState.currentState === "active";
            setStatus(foreground ? "error" : "waiting_foreground", alertId);
            logMobileTelemetry("audio_recording_failed", {
              reason: foreground ? "start_failed" : "start_in_background",
              message: error instanceof Error ? error.message : undefined,
            });
            await sleep(recorderRestartDelayMs(failures));
            continue;
          }

          if (failures > 0 || getSosAudioState().status !== "recording") {
            logMobileTelemetry("audio_recording_started", { alertId });
          }
          failures = 0;
          const startedAt = Date.now();
          setStatus("recording", alertId);

          // Grava até completar o trecho ou o alerta mudar (encerrado/pausado).
          while (
            desiredAlertId() === alertId &&
            Date.now() - startedAt < SOS_AUDIO_CHUNK_MS
          ) {
            await sleep(SOS_AUDIO_CHUNK_MS - (Date.now() - startedAt));
          }

          await finishChunk(alertId, fileUri, startedAt);
        }
      } finally {
        if (audioModeOn) {
          await setAudioModeAsync({
            allowsRecording: false,
            allowsBackgroundRecording: false,
          }).catch(() => undefined);
          logMobileTelemetry("audio_recording_stopped", {
            alertId: lastAlertId ?? undefined,
          });
        }
        loopRunningRef.current = false;
        const activeId = getActiveAlertId();
        const current = getSosAudioState();
        if (activeId && pausedAlertsRef.current.has(activeId)) {
          setStatus("paused_by_user", activeId);
        } else if (current.status !== "needs_permission" || !activeId) {
          setStatus("idle", activeId);
        }
        // O alerta pode ter mudado enquanto encerrávamos: confere de novo.
        if (desiredAlertId() && current.status !== "needs_permission") {
          void runLoop();
        }
      }
    };

    const kick = () => {
      void runLoop();
    };

    const unsubscribeAlert = onActiveAlertChange((alertId) => {
      if (!alertId) {
        pausedAlertsRef.current.clear();
      }
      kick();
    });

    const unsubscribeCommands = onSosAudioCommand((command) => {
      if (command.type === "pause") {
        pausedAlertsRef.current.add(command.alertId);
        kick();
      } else if (command.type === "resume") {
        pausedAlertsRef.current.delete(command.alertId);
        kick();
      } else if (command.type === "kick") {
        kick();
      }
    });

    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        kick();
        void flushAudioQueue(() => getAccessTokenRef.current());
      }
    });

    const flushTimer = setInterval(() => {
      void flushAudioQueue(() => getAccessTokenRef.current());
    }, IDLE_FLUSH_INTERVAL_MS);

    void getAudioQueueDepth();
    kick();

    return () => {
      mountedRef.current = false;
      unsubscribeAlert();
      unsubscribeCommands();
      appStateSub.remove();
      clearInterval(flushTimer);
      wake();
    };
  }, []);

  useEffect(() => {
    if (authenticated) {
      void flushAudioQueue(() => getAccessTokenRef.current());
    }
    // Sair da conta encerra a gravação (desiredAlertId passa a ser null).
    wakeRef.current?.();
  }, [authenticated]);

  return null;
}
