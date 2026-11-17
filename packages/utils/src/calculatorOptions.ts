import type { CalculatorExtraAttributeKey, CalculatorMetric, HeroBaseStats, PanelConstraintKey, PanelField } from '@phoenix/types'
import { metricPanelHighlights } from './calculator/panel.ts'

export const rarityLabels: Record<number, string> = {
  6: "UR",
  5: "SP",
  4: "SSR",
  3: "SR",
  2: "R",
  1: "N",
};

export const metricOptions: { value: CalculatorMetric; label: string }[] = [
  { value: "damage", label: "伤害指标：攻击 × 暴击伤害" },
  { value: "speed", label: "速度" },
  { value: "attack", label: "攻击" },
  { value: "health", label: "生命" },
  { value: "defense", label: "防御" },
  { value: "critRate", label: "暴击" },
  { value: "critDamage", label: "暴击伤害" },
  { value: "effectHit", label: "效果命中" },
  { value: "effectResistance", label: "效果抵抗" },
  { value: "hitResistance", label: "命抗双修：命中 + 抵抗" },
  { value: "healing", label: "治疗量：生命 × 暴击伤害" },
  { value: "defenseOutput", label: "防御输出：防御 × 暴击伤害" },
];

export const panelAttributeAliases: Record<string, PanelConstraintKey> = {
  攻击: "attack",
  攻击加成: "attack",
  生命: "health",
  生命加成: "health",
  防御: "defense",
  防御加成: "defense",
  速度: "speed",
  暴击: "critRate",
  暴击伤害: "critDamage",
  效果命中: "effectHit",
  效果抵抗: "effectResistance",
};

export function panelKeyForAttribute(
  label: string,
): PanelConstraintKey | undefined {
  return panelAttributeAliases[label];
}

export function isMetricSubAttribute(label: string, metric: CalculatorMetric) {
  const normalized = panelKeyForAttribute(label);
  return Boolean(
    normalized &&
    metricPanelHighlights[metric].includes(normalized as PanelConstraintKey),
  );
}

export const panelFields: PanelField[] = [
  { key: "attack", label: "攻击" },
  { key: "health", label: "生命" },
  { key: "defense", label: "防御" },
  { key: "speed", label: "速度" },
  { key: "critRate", label: "暴击", suffix: "%" },
  { key: "critDamage", label: "暴击伤害", suffix: "%" },
  { key: "effectHit", label: "效果命中", suffix: "%" },
  { key: "effectResistance", label: "效果抵抗", suffix: "%" },
];

export const extraAttributeFields: {
  key: CalculatorExtraAttributeKey;
  label: string;
  suffix?: string;
}[] = [
  { key: "attackPercent", label: "攻击加成", suffix: "%" },
  { key: "healthPercent", label: "生命加成", suffix: "%" },
  { key: "defensePercent", label: "防御加成", suffix: "%" },
  { key: "speed", label: "速度" },
  { key: "critRate", label: "暴击", suffix: "%" },
  { key: "critDamage", label: "暴击伤害", suffix: "%" },
  { key: "effectHit", label: "效果命中", suffix: "%" },
  { key: "effectResistance", label: "效果抵抗", suffix: "%" },
];

export const defaultExtraAttributes: Record<
  CalculatorExtraAttributeKey,
  number
> = {
  attackPercent: 0,
  healthPercent: 0,
  defensePercent: 0,
  speed: 0,
  critRate: 0,
  critDamage: 0,
  effectHit: 0,
  effectResistance: 0,
};

export const panelBadgeLabels: Partial<Record<PanelConstraintKey, string>> = {
  effectHit: "命",
  effectResistance: "抵",
};

export const mainAttributeOptions: Record<2 | 4 | 6, string[]> = {
  2: ["速度", "攻击加成", "生命加成", "防御加成"],
  4: ["攻击加成", "生命加成", "防御加成", "效果命中", "效果抵抗"],
  6: ["攻击加成", "生命加成", "防御加成", "暴击", "暴击伤害"],
};

export function allMainAttributes(): Partial<Record<2 | 4 | 6, string[]>> {
  return {
    2: [...mainAttributeOptions[2]],
    4: [...mainAttributeOptions[4]],
    6: [...mainAttributeOptions[6]],
  };
}

export const twoPieceAttributeOrder = [
  "暴击15%",
  "攻击加成15%",
  "暴击伤害20%",
  "生命加成15%",
  "防御加成30%",
  "效果命中15%",
  "效果抵抗15%",
];

export const twoPieceAttributeOrderMap = new Map(
  twoPieceAttributeOrder.map((attribute, index) => [attribute, index]),
);

export function format(value: number, digits = 0) {
  return Number.isFinite(value)
    ? value.toLocaleString("zh-CN", { maximumFractionDigits: digits })
    : "-";
}

export function basePanelConstraints(stats?: HeroBaseStats) {
  if (!stats) return {};
  return Object.fromEntries(
    panelFields.map(({ key }) => [key, { min: stats[key] }]),
  ) as Partial<Record<PanelConstraintKey, { min?: number; max?: number }>>;
}
