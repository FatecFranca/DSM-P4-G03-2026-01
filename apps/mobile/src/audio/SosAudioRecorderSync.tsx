import { ALERT_AUDIO_CHUNK_MAX_DURATION_MS } from "@protecther/contracts";
import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
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
import { sosRecorderNative } from "./sosRecorderNative";

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

/**
 * iOS: o próximo trecho começa *antes* de parar o atual (dois gravadores se
 * revezando). Com a tela bloqueada o iOS só deixa abrir o microfone se ele já
 * estiver em uso; parar e reabrir derrubava a gravação e o app era suspenso.
 * Android: o serviço em primeiro plano segura o microfone (patch STOP_GRACE_MS),
 * e dois MediaRecorder simultâneos falham em vários aparelhos — lá é em série.
 */
const OVERLAP_HANDOFF = Platform.OS === "ios";

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
  const recorderA = useAudioRecorder(SOS_RECORDING_OPTIONS);
  const recorderB = useAudioRecorder(SOS_RECORDING_OPTIONS);

  const recordersRef = useRef([recorderA, recorderB]);
  recordersRef.current = [recorderA, recorderB];
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

  const loopRunningRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);
  const pausedAlertsRef = useRef(new Set<string>());
  /** Alerta dono dos trechos que o gravador nativo (iOS) emitir. */
  const nativeAlertIdRef = useRef<string | null>(null);
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

    type Recorder = typeof recorderA;
    type LiveChunk = {
      slot: 0 | 1;
      alertId: string;
      fileUri: string;
      startedAt: number;
    };
    type RecordedChunk = {
      alertId: string;
      fileUri: string;
      startedAt: number;
      durationMs: number;
    };

    const recorderAt = (slot: 0 | 1): Recorder => recordersRef.current[slot];

    const stopChunk = async (chunk: LiveChunk): Promise<RecordedChunk> => {
      try {
        await recorderAt(chunk.slot).stop();
      } catch {
        // Interrompido pelo sistema: o arquivo pode ainda ser aproveitável.
      }
      return {
        alertId: chunk.alertId,
        fileUri: chunk.fileUri,
        startedAt: chunk.startedAt,
        durationMs: Date.now() - chunk.startedAt,
      };
    };

    /** Move o trecho para a fila e dispara o envio. Nunca lança. */
    const saveChunk = async (chunk: RecordedChunk) => {
      if (!chunk.fileUri || chunk.durationMs < SOS_AUDIO_MIN_CHUNK_MS) {
        return;
      }
      try {
        await enqueueRecordedChunk(chunk.fileUri, {
          alertId: chunk.alertId,
          clientChunkId: makeClientChunkId(chunk.startedAt),
          capturedAt: new Date(chunk.startedAt).toISOString(),
          durationMs: Math.min(
            chunk.durationMs,
            ALERT_AUDIO_CHUNK_MAX_DURATION_MS,
          ),
        });
        updateSosAudioState({
          chunksRecorded: getSosAudioState().chunksRecorded + 1,
        });
      } catch {
        logMobileTelemetry("audio_recording_failed", { reason: "enqueue" });
      }
      void flushAudioQueue(() => getAccessTokenRef.current());
    };

    /** Fim de qualquer laço: status final e, se o alerta mudou, recomeça. */
    const finishLoop = () => {
      loopRunningRef.current = false;
      const activeId = getActiveAlertId();
      const current = getSosAudioState();
      if (activeId && pausedAlertsRef.current.has(activeId)) {
        setStatus("paused_by_user", activeId);
      } else if (current.status !== "needs_permission" || !activeId) {
        setStatus("idle", activeId);
      }
      if (desiredAlertId() && current.status !== "needs_permission") {
        void runLoop();
      }
    };

    /**
     * iOS: gravador nativo contínuo (modules/sos-recorder). O microfone não é
     * solto entre trechos, então segue gravando *e enviando* com a tela
     * bloqueada; os trechos chegam pelo evento `onChunk`.
     */
    const runNativeLoop = async (
      native: NonNullable<typeof sosRecorderNative>,
    ) => {
      let failures = 0;
      let recordingAlertId: string | null = null;
      let permissionChecked = false;
      try {
        for (;;) {
          const alertId = desiredAlertId();
          if (!alertId) {
            break;
          }
          if (!permissionChecked) {
            const mic = await readMicPermission();
            if (!mic.granted) {
              setStatus("needs_permission", alertId);
              break;
            }
            permissionChecked = true;
          }
          if (recordingAlertId && recordingAlertId !== alertId) {
            await native.stop().catch(() => undefined);
            recordingAlertId = null;
          }
          if (recordingAlertId && !native.isRecording()) {
            recordingAlertId = null;
          }
          if (!recordingAlertId) {
            try {
              setStatus("starting", alertId);
              nativeAlertIdRef.current = alertId;
              await native.start(SOS_AUDIO_CHUNK_MS);
              recordingAlertId = alertId;
              failures = 0;
              updateSosAudioState({ foregroundOnly: false });
              setStatus("recording", alertId);
              logMobileTelemetry("audio_recording_started", { alertId });
            } catch (error) {
              failures += 1;
              permissionChecked = false;
              const foreground = AppState.currentState === "active";
              setStatus(foreground ? "error" : "waiting_foreground", alertId);
              logMobileTelemetry("audio_recording_failed", {
                reason: foreground ? "start_failed" : "start_in_background",
                message: error instanceof Error ? error.message : undefined,
              });
              await sleep(recorderRestartDelayMs(failures));
              continue;
            }
          }
          // Só vigia: o nativo corta e emite os trechos sozinho.
          await sleep(SOS_AUDIO_CHUNK_MS);
        }
      } finally {
        if (recordingAlertId) {
          // Emite o último trecho (mesmo curto) antes de soltar o microfone.
          await native.stop().catch(() => undefined);
          logMobileTelemetry("audio_recording_stopped", {
            alertId: recordingAlertId,
          });
        }
        finishLoop();
      }
    };

    const runLoop = async () => {
      if (loopRunningRef.current) {
        wake();
        return;
      }
      loopRunningRef.current = true;
      if (sosRecorderNative) {
        await runNativeLoop(sosRecorderNative);
        return;
      }
      let audioModeOn = false;
      let failures = 0;
      let lastAlertId: string | null = null;
      let permissionChecked = false;
      // Trecho gravando agora.
      let live: LiveChunk | null = null;
      // Trecho já parado (Android): salvo depois que o próximo começa.
      let pending: RecordedChunk | null = null;
      try {
        for (;;) {
          const alertId = desiredAlertId();
          if (!alertId) {
            break;
          }
          lastAlertId = alertId;

          if (!permissionChecked) {
            const mic = await readMicPermission();
            if (!mic.granted) {
              setStatus("needs_permission", alertId);
              break;
            }
            permissionChecked = true;
          }

          // Em série (Android) ou trocando de alerta: fecha o trecho atual antes.
          if (live && (!OVERLAP_HANDOFF || live.alertId !== alertId)) {
            pending = await stopChunk(live);
            live = null;
          }

          const slot: 0 | 1 = live ? (live.slot === 0 ? 1 : 0) : 0;
          const rec = recorderAt(slot);
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
            // No iOS, record() falha em silêncio (ex.: em segundo plano sem o
            // microfone já aberto): confere o estado real do gravador.
            if (Platform.OS === "ios" && !rec.isRecording) {
              throw new Error("record_not_started");
            }
          } catch (error) {
            failures += 1;
            const foreground = AppState.currentState === "active";
            logMobileTelemetry("audio_recording_failed", {
              reason: live
                ? "handoff_failed"
                : foreground
                  ? "start_failed"
                  : "start_in_background",
              message: error instanceof Error ? error.message : undefined,
            });
            if (live) {
              // O trecho atual continua gravando (fica mais longo): melhor
              // que soltar o microfone. Tenta a troca de novo daqui a pouco.
              await sleep(
                Math.min(recorderRestartDelayMs(failures), SOS_AUDIO_CHUNK_MS),
              );
              continue;
            }
            permissionChecked = false;
            setStatus(foreground ? "error" : "waiting_foreground", alertId);
            if (pending) {
              await saveChunk(pending);
              pending = null;
            }
            await sleep(recorderRestartDelayMs(failures));
            continue;
          }

          const next: LiveChunk = {
            slot,
            alertId,
            fileUri,
            startedAt: Date.now(),
          };
          // iOS: o novo já está gravando; só agora solta o anterior.
          if (live) {
            pending = await stopChunk(live);
          }
          live = next;
          if (pending) {
            void saveChunk(pending);
            pending = null;
          }
          if (getSosAudioState().status !== "recording") {
            logMobileTelemetry("audio_recording_started", { alertId });
          }
          failures = 0;
          setStatus("recording", alertId);

          // Grava até completar o trecho ou o alerta mudar (encerrado/pausado).
          while (
            desiredAlertId() === alertId &&
            Date.now() - next.startedAt < SOS_AUDIO_CHUNK_MS
          ) {
            await sleep(SOS_AUDIO_CHUNK_MS - (Date.now() - next.startedAt));
          }
          if (desiredAlertId() !== alertId) {
            pending = await stopChunk(next);
            live = null;
          }
        }
      } finally {
        if (live) {
          pending = await stopChunk(live);
          live = null;
        }
        if (pending) {
          await saveChunk(pending);
        }
        if (audioModeOn) {
          await setAudioModeAsync({
            allowsRecording: false,
            allowsBackgroundRecording: false,
          }).catch(() => undefined);
          logMobileTelemetry("audio_recording_stopped", {
            alertId: lastAlertId ?? undefined,
          });
        }
        finishLoop();
      }
    };

    const kick = () => {
      void runLoop();
    };

    const chunkSub = sosRecorderNative?.addListener("onChunk", (chunk) => {
      const alertId = nativeAlertIdRef.current;
      if (!alertId) {
        return;
      }
      void saveChunk({
        alertId,
        fileUri: chunk.uri,
        startedAt: Math.round(chunk.startedAt),
        durationMs: chunk.durationMs,
      });
    });
    const errorSub = sosRecorderNative?.addListener("onError", (error) => {
      logMobileTelemetry("audio_recording_failed", {
        reason: "native",
        message: error.message,
      });
    });

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
      chunkSub?.remove();
      errorSub?.remove();
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
