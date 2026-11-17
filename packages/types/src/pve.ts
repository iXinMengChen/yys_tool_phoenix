import type {
  CalculatedPanel,
  RelicCalculationRequest,
} from "./calculator.ts";
import type { RelicView } from "./relic.ts";

export type SuitOption = NonNullable<RelicView["suit"]>;

export type PveScoredRelic = {
  relic: RelicView;
  effectiveCount: number;
  maximumEffectiveCount: 8 | 11;
};

export type PveSuitScoreSummary = {
  suitName: string;
  totalScore: number;
  relicCount: number;
  isOma: boolean;
};

export type PveHighScoreGroup = {
  position: number;
  relics: PveScoredRelic[];
};

export type RelicSuitStaticPayload = {
  yuhun_list?: Array<
    [
      id: number,
      name: string,
      slug: string,
      twoPieceText?: string,
      effectText?: string,
    ]
  >;
};

export type PveMetric = {
  damage: number;
  panel: CalculatedPanel;
};

export type PveTableRow = {
  fourPieceSuitName: string;
  metrics: Array<PveMetric | undefined>;
  average?: number;
};

export type PveWorkerJob = {
  id: string;
  fourPieceSuitName: string;
  omaSuitName: string;
  request: RelicCalculationRequest;
};

export type PveWorkerPayloadJob = Omit<PveWorkerJob, "request"> & {
  request: Omit<RelicCalculationRequest, "relicsByPosition">;
};

export type PveWorkerResponse = {
  type: "result" | "done" | "error";
  requestId: number;
  result?: { id: string; metric?: PveMetric };
  message?: string;
};
