import type { ImageSourcePropType } from "react-native";
import type { DiscreetIconKey } from "./discreetIcons";

/** Prévias exibidas no seletor (geradas por scripts/generate-discreet-icons.py). */
export const DISCREET_ICON_PREVIEWS: Record<
  DiscreetIconKey,
  ImageSourcePropType
> = {
  original: require("../../assets/discreet-icons/original/preview.png"),
  notes: require("../../assets/discreet-icons/notes/preview.png"),
  calculator: require("../../assets/discreet-icons/calculator/preview.png"),
  weather: require("../../assets/discreet-icons/weather/preview.png"),
  calendar: require("../../assets/discreet-icons/calendar/preview.png"),
  cycle: require("../../assets/discreet-icons/cycle/preview.png"),
  clock: require("../../assets/discreet-icons/clock/preview.png"),
};
