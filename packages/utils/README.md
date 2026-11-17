# @phoenix/utils

与框架、网络、持久化及浏览器环境无关的业务逻辑。公共契约从 `@phoenix/types` 导入，运行时 API 从包根导入。

## 业务入口

- `parseProductUrl(input)`：仅接受允许域名、HTTP(S) 默认端口和精确的 `/equip/{serverid}/{ordersn}` 或 `/cgi/mweb/equip/{serverid}/{ordersn}` 商品路径，拒绝 URL 凭据。解码订单编号后按 API 白名单限制为 1–128 位字母/数字/`_`/`-`；区服限 1–20 位数字。返回的 `sourceUrl` 重新构造为 HTTPS `/cgi/mweb/equip/…`（与 API 的商品来源链接一致），无原始查询串或片段，仅保留通过 API 同等长度/字符限制的 `view_loc`（2048）、`tfid`/`tcid`（各 128）；重复的允许参数会被拒绝，其他 query 一律剥离。
- `getCollectionSections(owned, catalog)`：按官方收藏目录归类账号持有ID，只返回已拥有条目，按ID去重；典藏/臻藏仅用式神持有皮肤匹配目录，缺失持有字段保持未知且不返回条目，不以目录条目数代替拥有数；保留未收录的独立分类持有ID。收藏分类有重叠，不能相加。
- `createRelicSuitConfig(payload)`：将静态套装元组响应转换为转换器索引。
- `convertCbgPayloadToDataset(payload, suitConfig, options?)`：转换账号、式神、御魂和强化明细。Web 在浏览器 Worker 中调用，服务端商品接口仅提供精简原始 `CbgProductData`。`includeEnhancementStages: false` 跳过详情快照生成但保留原始强化记录；打开御魂弹窗时调用 `buildEnhancementStages` 按需生成，不丢失详情。
- `analyzeAccountValue`、`getBestSpeedCombinationForSuit`、`getBestScatteredSpeedCombination`、`calculateIndependentSpeed`：账号价值、四件套/散件速度和不重复用魂的独立配速。速度组合的 `value` 不含二号位速度主属性和式神基础速度。
- `scorePveRelic`、`getPveSuitScoreRanking`：PVE 有效强化评分与套装汇总。
- `calculateRelicPanel`、`calculateMetricValue`、`calculateRelicCombinationsForRequest`：面板与组合搜索。套装两件套加成通过 `suitTwoPieceAttributes` 注入；`resultLimit` 为结果上限，支配剪枝后可能不足该数量。
- `parseIndependentSpeedPresets`：解析应用传入的持久化字符串；此包不访问 storage。
- `buildAccountSummary(dataset, pveDamageSummary?)`：生成账号摘要；`calculatePveDamageSummary(dataset, heroPayload)` 接受静态式神面板并同步计算 PVE 输出摘要，不自行请求数据。大仓库计算应由应用放入 Worker，避免阻塞界面。
- `getCalculatorConfigPreview(config, heroes?)`：生成计算器配置预览，式神静态表由调用方注入。

所有纯计算器算法保留原有精确/快速搜索、筛选、上下界约束、二件套/首领魂规则及排名逻辑。线程生命周期、取消、进度传输和浏览器持久化属于应用适配层，不在此包实现。

## 运行与验证

```sh
pnpm --filter @phoenix/types typecheck
pnpm --filter @phoenix/utils typecheck
pnpm --filter @phoenix/utils test
pnpm exec eslint packages/types packages/utils
```

检查使用 Node.js 24 自带 TypeScript stripping 与 `node:test`，无需测试框架。公开源码保持 ESM，跨工作区使用现有 `file:` 依赖；Node.js 24 的 CommonJS `require('@phoenix/utils')` 可同步消费不含顶层 await 的源码。运行检查包含实际包名加载与调用。Nest 编译端应继续使用 type-only 契约导入；不要让 CommonJS 编译器将共享源文件复制到应用输出目录。
