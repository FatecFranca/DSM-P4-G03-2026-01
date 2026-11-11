import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActiveAlertId,
  onActiveAlertChange,
  publishActiveAlert,
} from "../alerts/activeAlertBus";
import {
  getSosAudioState,
  onSosAudioCommand,
  resetSosAudioStateForTests,
  sendSosAudioCommand,
  subscribeSosAudioState,
  updateSosAudioState,
} from "./sosAudioStore";

afterEach(() => {
  resetSosAudioStateForTests();
  publishActiveAlert(null);
});

describe("sosAudioStore", () => {
  it("avisa quem escuta só quando algo muda", () => {
    const listener = vi.fn();
    subscribeSosAudioState(listener);
    updateSosAudioState({ status: "recording", alertId: "a1" });
    updateSosAudioState({ status: "recording", alertId: "a1" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSosAudioState()).toMatchObject({
      status: "recording",
      alertId: "a1",
    });
  });

  it("entrega comandos da interface ao gravador", () => {
    const listener = vi.fn();
    const unsubscribe = onSosAudioCommand(listener);
    sendSosAudioCommand({ type: "pause", alertId: "a1" });
    unsubscribe();
    sendSosAudioCommand({ type: "kick" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: "pause", alertId: "a1" });
  });
});

describe("activeAlertBus", () => {
  it("publica mudanças do alerta ativo sem repetir", () => {
    const listener = vi.fn();
    const unsubscribe = onActiveAlertChange(listener);
    publishActiveAlert("a1");
    publishActiveAlert("a1");
    publishActiveAlert(null);
    unsubscribe();
    expect(listener.mock.calls).toEqual([["a1"], [null]]);
    expect(getActiveAlertId()).toBeNull();
  });
});
