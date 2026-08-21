import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { assignVariant } from "./assignment";
import { elapsedMs } from "./elapsed";
import { SOS_BUTTON_EXPERIMENT } from "./experiments";
import { experimentTracker } from "./trackerInstance";

type SosExperiment = {
  readonly variantId: string;
  /** Dispara a conversão com o tempo decorrido desde que a tela montou. */
  readonly trackConversion: (metric: string) => void;
};

export function useSosExperiment(): SosExperiment {
  const { state } = useAuth();
  const userId =
    state.status === "authenticated" ? state.session.user.id : undefined;
  const mountedAtMs = useRef(Date.now());

  const variantId = useMemo(
    () => assignVariant(SOS_BUTTON_EXPERIMENT, userId),
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    experimentTracker.trackExposure(
      SOS_BUTTON_EXPERIMENT.key,
      variantId,
      userId,
    );
  }, [userId, variantId]);

  return {
    variantId,
    trackConversion: (metric: string) => {
      experimentTracker.trackConversion(
        SOS_BUTTON_EXPERIMENT.key,
        metric,
        elapsedMs(mountedAtMs.current, Date.now()),
      );
    },
  };
}
