import type { CalculatorExtraAttributeKey, CalculatorMetric, PanelConstraintKey, RelicCalculationRequest } from './calculator.ts'

export type SuitType = {
  id: number;
  name: string;
  twoPieceText: string;
  isOma: boolean;
};

export type CbgYuhunConfig = {
  yuhun_list?: Array<
    [
      id: number,
      name: string,
      slug: string,
      twoPieceText?: string,
      effectText?: string,
    ]
  >;
  two_suit_yuhun?: Record<string, string>;
};

export type StaticUpdateReport = {
  heroCount: number;
  suitCount: number;
};

export type PanelField = {
  key: PanelConstraintKey;
  label: string;
  suffix?: string;
};

export type ExtraAttributeField = {
  key: CalculatorExtraAttributeKey;
  label: string;
  suffix?: string;
};

export type CalculatorPanelShortcut = {
  label: string;
  values: Partial<Record<PanelConstraintKey, { min?: number; max?: number }>>;
};

export type CalculatorMainAttributePreset = {
  label: string;
  icon?: "clear";
  mainAttributes: Partial<Record<2 | 4 | 6, string[]>>;
  metric?: CalculatorMetric;
};

export type CustomPanelShortcut = {
  id: string;
  label: string;
  values: Partial<Record<PanelConstraintKey, { min?: number; max?: number }>>;
};

export type CustomMainAttributeShortcut = {
  id: string;
  label: string;
  mainAttributes: Partial<Record<2 | 4 | 6, string[]>>;
};

export type SavedCalculatorConfig = {
  id: string;
  label: string;
  heroId?: number;
  metric: CalculatorMetric;
  resultLimit: number;
  constraints: Partial<
    Record<PanelConstraintKey, { min?: number; max?: number }>
  >;
  extraAttributes: Record<CalculatorExtraAttributeKey, number>;
  mainAttributes: Partial<Record<2 | 4 | 6, string[]>>;
  relicSuitSelection: {
    fourPiece?: string;
    twoPieceAttributes: string[];
    omaTwoPieces: string[];
  };
};

export type CalculationRequest = Omit<
  Required<RelicCalculationRequest>,
  "fixedSuitPhase" | "initialResults"
>;

export type RelicSuitSelection = {
  fourPiece?: string;
  twoPieceAttributes: Set<string>;
  omaTwoPieces: Set<string>;
};

export type RecentRelicChoice = {
  kind: "fourPiece" | "twoPieceAttribute" | "omaTwoPiece";
  value: string;
};

export type ConfigPreview = {
  heroName: string;
  metric: string;
  suitSummary: string;
  mainAttributeSummary: string;
  constraintSummary?: string;
};

export type CalculatorConstraintRanges = Partial<
  Record<PanelConstraintKey, { min?: number; max?: number }>
>;

export type MetricOption = { value: CalculatorMetric; label: string };

export type CalculatorHeroOption = {
  id: number;
  name: string;
  rarityCode?: number;
};

export type CalculatorNumericRange = { min?: number; max?: number };
