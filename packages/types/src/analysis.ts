export type RelicStatKey =
  | "speed"
  | "critRate"
  | "critDamage"
  | "attackPercent"
  | "flatAttack"
  | "healthPercent"
  | "flatHealth"
  | "defensePercent"
  | "flatDefense"
  | "effectHit"
  | "effectResistance";

export type RelicEvidence = {
  relicId?: string;
  suitName: string;
  position: number;
  level: number;
  quality: number;
  mainAttribute?: string;
  value: number;
};

export type SellingPoint = {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  value: number;
  unit: string;
  description: string;
  evidence: RelicEvidence[];
};

export type SpeedCombination = {
  value: number;
  relics: RelicEvidence[];
};

export type SuitSpeedCombinationOptions = {
  fourthMainAttribute?: string;
  sixthMainAttribute?: string;
  /** 多选主属性；未传或为空时不限制对应号位。 */
  fourthMainAttributes?: readonly string[];
  sixthMainAttributes?: readonly string[];
};

export type RelicInventoryAnalysis = {
  totalRelics: number;
  maxLevelRelics: number;
  effectiveRolls: number;
  effectiveRelics: number;
  bestSpeed: SpeedCombination | null;
  bestLuckySpeed: SpeedCombination | null;
  bestSpeedBySuit: Record<string, RelicEvidence>;
  speedSellerPoints: RelicEvidence[];
  fullSpeedRelics: RelicEvidence[];
};

export type AccountValueAnalysis = {
  totalScore: number;
  maxScore: number;
  sellingPoints: SellingPoint[];
  relics: RelicInventoryAnalysis;
};

export type IndependentSpeedConfig = {
  id: string;
  suitName?: string;
  fourthMainAttributes: string[];
  sixthMainAttributes: string[];
};

export type IndependentSpeedPreset = {
  id: string;
  name: string;
  configs: IndependentSpeedConfig[];
};

export type IndependentSpeedResult = {
  configId: string;
  combination: SpeedCombination | null;
};
