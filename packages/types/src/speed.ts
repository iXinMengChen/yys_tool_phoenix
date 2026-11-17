import type { RelicView } from './relic.ts'

export type SpeedCombinationPreview = {
  relics: RelicView[];
  speed: number;
};

export type SpeedCombinationOptions = {
  fourthMainAttributes?: readonly string[];
  sixthMainAttributes?: readonly string[];
};

export type SpeedSuitOption = {
  id: number;
  name: string;
};
