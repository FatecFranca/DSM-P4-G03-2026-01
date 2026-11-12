import { requireOptionalNativeModule } from "expo";

type EventSubscription = { remove(): void };
import { Platform } from "react-native";

export type NativeSosChunk = {
  /** file:// do trecho AAC (M4A) já finalizado. */
  uri: string;
  /** Início do trecho (epoch ms). */
  startedAt: number;
  durationMs: number;
};

type SosRecorderNative = {
  start(chunkMs: number): Promise<void>;
  stop(): Promise<void>;
  isRecording(): boolean;
  addListener(
    event: "onChunk",
    listener: (chunk: NativeSosChunk) => void,
  ): EventSubscription;
  addListener(
    event: "onError",
    listener: (error: { message: string }) => void,
  ): EventSubscription;
};

/**
 * Gravador contínuo do iOS (modules/sos-recorder): o microfone fica aberto e só
 * o arquivo é trocado a cada trecho — continua com a tela bloqueada. `null` no
 * Android ou em builds sem o módulo nativo (aí vale o expo-audio).
 */
export const sosRecorderNative: SosRecorderNative | null =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<SosRecorderNative>("SosRecorder")
    : null;
