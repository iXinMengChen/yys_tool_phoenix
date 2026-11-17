/** 数字 ID 由明确的资料来源提供；皮肤配对只在 Rust 内从官方详情提取。 */
export type StaticAssetUpdateRequest = {
  heroIds: number[];
  suitIds: number[];
  currencyIds?: number[];
  decoCardHouseIds?: number[];
  headSkinIds?: number[];
  sceneSkinIds?: number[];
  badgeIds?: number[];
  yingyuanIds?: number[];
};

export type StaticAssetUpdateResult = {
  heroIcons: number;
  suitIcons: number;
  catalogIcons: number;
  failed: number;
};
