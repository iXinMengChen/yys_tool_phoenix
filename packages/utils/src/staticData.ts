import type { CbgYuhunConfig, RelicSuitConfig } from '@phoenix/types'

/** 将共享静态套装响应转换为藏宝阁转换器所需的索引。 */
export function createRelicSuitConfig(payload: CbgYuhunConfig): RelicSuitConfig {
  return {
    two_suit_yuhun: payload.two_suit_yuhun ?? {},
    two_piece_attributes: Object.fromEntries(
      (payload.yuhun_list ?? []).flatMap(([id, , , attribute]) =>
        attribute === undefined ? [] : [[String(id), attribute]],
      ),
    ),
  }
}
