# API 接口

## 基础约定

- NestJS 全局前缀由 `API_BASE_URL` 配置，模板默认 `/api`。
- JSON 成功响应统一为 `{ "code": 200, "message": "success", "data": ... }`；图片端点直接返回二进制 `StreamableFile`，不套 JSON 信封。异常响应保留真实 HTTP 状态码并返回 `{ code, message, data: null }`。
- 5xx 仅公开通用错误，不返回上游原文、Cookie、SID 或数据库连接信息。
- Swagger UI 默认地址为 `/api/docs`，OpenAPI JSON 为 `/api/docs-json`。

## 短时访问限制

所有已注册业务接口（含健康检查、桌面版本、会话、商品、静态资料和图片）通过全局 Guard 按客户端 IP 限流，使用 10 秒固定窗口：

- 普通接口共享每 IP 10 次/10 秒额度，切换路径、参数或 HTTP 方法不会新增额度。
- `/cbg/images/*` 与 `/cbg/collection-images/*` 共享独立的每 IP 60 次/10 秒图片额度，避免图鉴并发占用普通查询额度。
- 超限保留真实 HTTP 429，返回 `{ "code": 429, "message": "访问过于频繁，请稍后重试", "data": null }`，附带 `Retry-After`（向上取整的剩余秒数）与 `Cache-Control: no-store`。客户端可显示该提示，不应立即自动重试。已有商品风控和资料刷新冷却继续生效。
- 计数只保存在当前 API 进程内存，重启清零；最多保留 20,000 个 IP/类别条目，定期惰性清理过期项，容量满时对新条目返回 429。多进程/多实例部署需改为共享计数存储。Swagger 文档页面与未匹配路由不属于业务 Guard 范围。

API 仍只监听 `127.0.0.1`，Express 仅信任 loopback 代理。公网反向代理必须提供真实客户端 IP；公网入口建议设置 `proxy_set_header X-Forwarded-For $remote_addr;`，覆盖客户端自带的同名头。如果 Web 的 Next rewrite 继续转发 API 请求，公网代理也必须在进入 Web 时覆盖该头，API 才能正确区分用户并阻止伪造地址。中间代理须保留可信地址链，不要使用无条件 `trust proxy=true`。同公网 IP 的客户端共享额度。Nginx 直接命中图片缓存的请求不会到达 API，因此不计入 API 配额；需要限制缓存命中流量时应另外在 Nginx 配置限流。

离线检查：`node --test apps/api/checks/rate-limit.mjs`，覆盖共享额度、图片额度、IP 隔离、窗口恢复、存储上限、代理地址与统一 429 响应，不启动服务、不读取本机配置、不访问数据库或网络。

## 已实现

| 方法 | 路径（前缀为 `/api` 时） | `data` |
| --- | --- | --- |
| `GET` | `/api/health` | `{ status: 'ok' }` |
| `GET` | `/api/desktop/version` | `DesktopReleaseInfo`：数据库中的最新桌面版本公告 |
| `GET` | `/api/cbg/session` | `{ configured: boolean, refreshedAt: string \| null }` |
| `GET` | `/api/cbg/product` | `CbgProductData`：版本化、递归白名单剪枝的精选原始商品数据 |
| `POST` | `/api/cbg/product-summary` | `CbgProductSummaryReceipt`：商品文本摘要入库回执，保留三个月 |
| `GET` | `/api/cbg/static` | `{ heroes, heroCatalog?, collections?, relicSuits, serverList, source, refreshedAt, heroBaseStatsSource, missingHeroIds }`：真实静态资料 |
| `GET` | `/api/cbg/images/*path` | 按语义路径读取原始 PNG/JPEG/GIF/WebP 图片字节（无 JSON 信封） |
| `GET` | `/api/cbg/collection-images/:kind/:id` | 旧收藏图片路由，兼容历史记录 |

### 桌面版本查询

`GET /api/desktop/version` 无需凭据或参数，实时查询 PostgreSQL 的 `DesktopRelease` 表并按 `publishedAt DESC` 取最新记录；仍使用统一成功响应信封。`data` 为共享包 `@phoenix/types` 公开的 `DesktopReleaseInfo`：

```ts
{ configured: false }
// 或（存在最新数据库记录时）
{ configured: true, version: string, downloadUrl: string, notes: string }
```

`DesktopRelease` 表的 `version` 为主键，另有 `downloadUrl`、`notes`（默认空字符串）和 `publishedAt`。`downloadUrl` 必须录入真实 HTTPS 小飞机网盘分享链接；API 不下载文件、不提供文件下载接口，也不根据请求 Host 或协议拼接链接。当前暂无正式发布日志，`notes` 留空即可。数据库没有公开写入接口，请通过受控迁移/数据库运维录入版本、真实分享 URL、说明和发布时间；记录变更无需重启即可被查询到，服务不缓存结果。公告仅负责引导用户打开网盘链接，不是 Tauri 自动更新清单，也不代表自动下载安装或签名校验。客户端应按 SemVer 比较当前版本，展示说明时不要作为 HTML 执行。

迁移已录入 `1.0.0-beta.10` 和用户提供的 [小飞机网盘分享链接](https://share.feijipan.com/s/4b7LXxbh)，`notes` 留空。响应带 `Cache-Control: no-store`。数据库查询失败走统一 5xx，不会伪装成“尚无版本”。

离线定向检查：`node --test apps/api/checks/desktop-version.mjs`；不连接数据库、不读取本机配置、不执行构建。

### 商品摘要上传（RAG 数据收集）

`POST /api/cbg/product-summary` 接收 JSON，对应共享契约 `CbgProductSummaryUpload`：

```json
{
  "channel": "official",
  "serverid": "1",
  "ordersn": "PRODUCT_ORDER_ID",
  "summary": "公开商品摘要：等级 60，式神及御魂配置概述……"
}
```

- 商品标识规则与商品查询一致；`channel` 默认 `official`。`summary` 为 1–32000 字符纯文本，去除首尾空白后不能为空。未知字段返回 400，不接收原始账号对象、SID、Cookie 或自定义 URL；上传方也不得把凭据或私密资料写入摘要正文。
- 摘要写入 PostgreSQL `"ProductSummary"."summary"`，与三天商品缓存完全独立。以渠道、区服、订单号去重，重复上传覆盖文本、保留 id，并从本次服务器上传时间重新计算三个 UTC 自然月有效期；月末按目标月最后一天截断。服务启动时及每小时删除已过期摘要，停机期间恢复启动后补清理；物理清理最多延迟一个检查周期。未来检索/导出必须过滤 `expiresAt > 当前时间`，避免读到待清理行。
- HTTP 200 的 `data` 为 `CbgProductSummaryReceipt`：`{ id, source: 'client_upload', uploadedAt, expiresAt }`；两个时间字段均为 ISO UTC 字符串。仅数据库保存成功才返回成功；失败走统一 5xx，不吞错。响应带 `Cache-Control: no-store`。
- 当前接口公开接收上传，受普通 IP 限流；来源固定标记为 `client_upload`，未经上游核实，不能直接当作可信事实。后续 RAG 应保留此来源标记并进行质量校验；本次不生成 embedding、不建设向量检索，也不添加公开摘要下载接口。
- Web 在商品查询或最近查询恢复、客户端解析成功后，复用“复制摘要”的纯文本后台无感上传，不等待上传完成、不显示上传提示。按渠道、区服、订单号去重：同页面合并正在上传的商品，成功后在当前浏览器记录回执有效期，在有效期内再次读取同一商品不生成或上传摘要；回执到期后允许重传。浏览器存储不可用时仅在当前页面内去重；失败或无有效成功回执不记为已上传，下次读取可重试。不同浏览器的去重记录独立，服务端仍通过唯一索引避免重复数据行。
- 摘要上传不会触发上游商品查询；Web 不批量补传历史，已有缓存可通过重新查询或打开最近查询补传。桌面本地账号不接入自动上传。现有 Next rewrite 已覆盖此路径。
- 新增迁移只创建摘要表、唯一索引与过期索引，不修改旧缓存数据；上线需先应用迁移。离线检查：`node --test apps/api/checks/product-summary.mjs`。

### 商品缓存排查

服务器商品缓存位于 PostgreSQL 精确大小写表名 `"AccountSnapshot"` 的 JSONB 字段 `"accountPayload"`，不是独立商品列表表。可以先执行以下只读 SQL（默认 schema 为 public）：

```sql
SELECT "channel", "serverId", "orderSn", "relicVersion", "cachedAt", "expiresAt"
FROM public."AccountSnapshot"
ORDER BY "cachedAt" DESC
LIMIT 20;
```

只有 Web 的 `/cbg/product` 成功取数才会写入；桌面 Tauri 本地取号、本地历史命中均不走此路径，不会写服务器缓存。Web 查询成功但数据库无记录时，检查 API 是否运行包含缓存逻辑的新构建、是否查看了同一个目标库/schema、迁移是否成功，以及 API 日志中的“商品缓存保存失败”。写缓存失败仍会返回商品，因此查询成功不代表已入库。新写入/刷新缓存保留 3 天；已有记录保留原 `expiresAt`，不批量延长。启动时及每小时清理已过期的 `cbg-product-v1` 缓存，不删除旧格式历史。

API 启动时的 `PrismaService` 日志会输出从 PostgreSQL 实际查询得到的数据库名、角色、schema、服务器地址和端口（Unix socket 下地址/端口可能为空），用于核对是否连错实例；不输出连接 URL 或密码。商品缓存读取、保存及过期清理失败会附带经过筛选的 Prisma/PostgreSQL 错误码及固定提示，例如 `42501` 表示权限不足、`P2021` / `42P01` 表示缺表、`28P01` 表示认证失败。静态资料持久化复用相同诊断；不记录原始异常、SQL、商品数据或凭据。更新代码只改进诊断，不自动授予权限或搬迁数据库。

### 商品查询

示例：`GET /api/cbg/product?serverid=1&ordersn=PRODUCT_ORDER_ID&channel=official`。

商品专用限制在数据库缓存检查之后执行：有效的 3 天缓存命中直接返回，不增加等待、不进入上游查询队列；缓存未命中（含缓存过期、旧格式或读取失败）按缓存检查完成顺序排队，轮到后先异步等待 2 秒再执行上游查询。每个 API 进程同一时间只处理一个商品上游查询，后续不同商品请求保持等待，不因队列繁忙返回 429；同一渠道/区服/订单号的并发请求共享已有结果，不重复入队。某次上游失败会向对应请求返回真实错误，队列继续处理后续商品，不因前一项失败而阻塞。缓存命中仍受前述全局 IP 额度限制。队列位于进程内存，等待时间取决于前方查询数量及上游耗时；多实例部署需使用共享队列。Web 商品请求及 Next rewrite 的等待预算统一为 5 分钟，公网 Nginx 的商品代理也应设置至少 `proxy_read_timeout 300s;`，避免排队时提前断开；超长队列仍可能触发网络超时。`Retry-After` 仅对全局短时额度超限保证提供，上游风控 429 沿用已有规则。

| 参数 | 约束 |
| --- | --- |
| `serverid` | 必填，1–20 位数字 |
| `ordersn` | 必填，1–128 位英文字母、数字、`_` 或 `-` |
| `channel` | 可选，默认 `official`；另支持 `huawei`、`oppo`、`vivo`、`xiaomi` |
| `view_loc` | 可选，最多 2048 字符，不允许换行 |
| `tfid`、`tcid` | 可选，各最多 128 位英文字母、数字、`_` 或 `-` |

未知参数（包括 `sid`、`cookie`、自定义上游 URL）一律 400。控制器不接收浏览器凭据。初始 SID 仅使用服务端 `CBG_LOGIN_COOKIE` 中通过格式校验的 `sid`；商品缓存未命中且 Cookie 为空、缺少 SID 或 SID 无效时返回 503。服务端统一配置含 SID 的完整登录 Cookie；Cookie 中其他登录字段在刷新与商品请求时保留，不应把仅有 SID 视为完整登录凭据。官方渠道商品缓存未命中时，服务端以自身配置调用固定 `login_auto`；并发刷新合并为一次。刷新必须收到合法的新 SID 响应头，缺失时返回 502，不冒充成功或直接沿用旧值继续查询。确认登录成功且取得有效 SID 后，服务端原子更新内存中的 SID 和响应 `Set-Cookie` 返回的登录字段（包括 `NTES_SESS`、共享登录令牌），并移除明确过期的 Cookie，供后续刷新和商品请求使用；刷新被拒绝或缺少有效 SID 时保留上一份完整会话。更新值不写文件/数据库，不通过会话状态接口返回，重启恢复服务端初始配置。此机制延续仍有效的登录凭据，不提供密码登录，也不能保证已失效或被撤销的凭据重新登录。没有公开的刷新或凭据设置接口。

SID 响应头依次检查 `sid`、`x-sid`、`cbg-sid`、`x-cbg-sid` 和 `Set-Cookie` 中的 SID；无效候选不遮蔽后续有效值，所有候选均无效时仍返回 502。服务端错误日志区分“上游未确认登录”和“登录响应缺少有效 SID 响应头”；前者只附带限长的数字 `status` / `status_code`（其他值记为 `unknown`），不记录上游消息、响应正文或凭据。浏览器仍收到通用 5xx 错误。

商品详情取自各渠道固定官方主机；缺少 `equip_desc` 时按已校验的 `ordersn` 从 `cbg-other-desc.res.netease.com/yys/static/equipdesc/<ordersn>.json` 补齐。禁止跳转、自定义主机、端口和用户信息；所有上游响应同时检查 Content-Length 和解压后流式字节量，上限 32 MiB、超时 20 秒。服务端只负责上游取数、必要结构校验和递归白名单剪枝，返回精选原始字段；账号视图、御魂拆解和强化阶段转换在客户端执行。

公开响应 `data` 的契约为 `@phoenix/types` 导出的 `CbgProductData`：

```ts
{
  schemaVersion: 1,
  channel: 'official',
  sourceUrl: 'https://yys.cbg.163.com/cgi/mweb/equip/1/PRODUCT_ORDER_ID',
  equip: {
    price: '12345', // 原始单位为分；数值可为 number 或可解析为有限数值的 string
    equip_name: '藏宝阁商品',
    equip_desc: { // 恒为对象，兼容上游字符串 JSON 或对象输入
      lv: '60', money: '100000', goyu: '1200',
      heroes: { a: { heroId: '100', lv: '40', skinfo: [['1', '5']], selectSkills: ['1'] } },
      inventory: { a: { uuid: 'r1', pos: '2', suitid: '300001', level: '15', qua: '6', attrs: [['速度', '57']], rattr: [['speedAdditionVal', '0.99']] } },
      hero_history: { ssr: { all: '1', got: '1', '100': ['', '1'] } },
      damo_count_dict: { '1': { '411': '2' } },
    },
  },
}
```

- 顶层固定为 `schemaVersion`、`channel`、`sourceUrl`、`equip`；上游 `equip_data` 归一为 `equip`。`sourceUrl` 为固定 HTTPS 商品路径，不带凭据、跟踪参数或片段。
- `equip` 只保留 `equip_desc`、`price`、`equip_name`、`format_equip_name`、`server_name`、`status_desc`、`highlights`。展示名称保留；未知商品字段、卖家资料和上游订单字段剔除。
- `equip_desc` 只保留 `inventory`、`heroes`、`hero_history`、`damo_count_dict`、归一化的 `collections`，以及转换器实际读取的账号字段：`name`、`origin_server_name`、`lv`、`fengzidu`、`pvp_score`、`pvp_stage`、`equips_summary`、`hero_summary`、`money`、`strength`、`level_15`、`goyu`、`soul_jade`、`gameble_card`、`ar_gamble_card`、`ssr_coin`、`sp_coin`、`currency_900273`、`currency_490017`。
- 式神仅保留 `heroId`、`heroUid`、`uid`、`name`、`rarity`、`level`/`lv`/`heroLevel`/`hero_level`、`skinfo`、`selectSkills`；御魂仅保留 `uuid`、`name`、`level`、`qua`、`pos`、`suitid`、`rattr`、`attrs`、`single_attr`。技能、强化轨迹、属性元组只保留前两项，保留原始精度、数值字符串和百分数字符串；`single_attr: []` 仍有效。
- `collections` 由账号 `skin`、`head_skin`、`honors` 归一化为去重正整数 ID 数组，剔除原元组名字与多余字段：`heroSkins` 与 `otherSkins` 取 `skin.ss` 第三项，但只接受第 4 项严格为 `true` 的持有条目；`onmyojiSkins` 取 `skin.yys` 第三项。兼容字段 `skins` 仍合并已确认的 ss/yys/guard（全部存在才提供）；前端优先用明确分类字段展示皮肤；旧历史的 `heroSkins` 可恢复其他皮肤分类，且仅在 `skins`、`heroSkins`、`spiritSkins` 三组齐全时，通过全部皮肤减去式神皮肤与御灵皮肤恢复阴阳师皮肤。不完整的旧混合字段不用于猜测分类。yard/gamble/shishenlu/battle/yinyangshu 第一项依次映射庭院/召唤屋/式神录/战斗主题/阴阳术。`frames` 取头像框对象的键（不看值真假）；`honors` 保留高级徽章 ID。未提供字段保持缺失，空数组才表示明确无持有；成就、术印与特殊皮肤没有确认持有字段，不猜测映射。典藏/臻藏由客户端用 heroSkins 与官方目录求交集。原 `skin`/`head_skin` 不外传；旧历史可不含 `collections`。
- `hero_history` 只保留 `ssr`/`sp`/`ur` 中的 `all`、`got`、数字式神 ID。拥有标记元组统一为 `['', owned]`，删除上游名字及多余内容；数字形式的标记保持原值。`damo_count_dict` 各来源只保留物品 `411` 数量。所有普通对象剔除未知字段，记录值同样递归剪枝。
- 可选字段允许缺失；上游既有可空字段保留 `null`。结构非法或必须为数值的字段无法解析为有限数值时返回 502。类型完整字段以公开契约为准。

客户端使用 `convertCbgPayloadToDataset(product, suitConfig, { includeEnhancementStages: false })` 派生视图，再将 `product.channel`/`product.sourceUrl` 写入派生 `account`；本地历史保存精简 `product`，查询服务不构造或保存 `RelicDataset`。

- 参数无效：400。
- 风控/验证码/403/429：429，并使本 API 进程暂停所有渠道查询 24 小时。包括 HTTP 200 携带的既有真实风控信号：`status: 0` 且 `msg: 服务暂时不可用，请稍后重试`、`系统繁忙。反馈代号(...)`、`稍后再试`；不会因 HTTP 200 继续请求。冷却目前在内存中，重启不保留，部署多个副本前应接入共享冷却存储。
- 上游网络、JSON/数据结构异常或刷新失败：502（公开通用错误）。
- 服务端 SID 未配置：503（公开通用错误）。

### 静态资料

首次读取默认加载 PostgreSQL 中 `cbg_game_auto_config` 的 `game_id=yys` 配置及 `heroes` 目录，随后使用进程缓存。数据库面板优先，缺失条目回退到可信内置面板；数据库暂时不可用时回退到内置资料并记录通用告警。已存官方 JSON 在使用前重新校验，非法配置回退到内置目录，不影响可用的数据库面板。`heroes` 返回 `schemaVersion`、实际 `heroCount`、`heroesById`；`relicSuits` 返回 `yuhun_list`、`two_suit_yuhun`。`serverList` 为官方区服树，每组 `{ id, name, servers: [{ id, name }] }`，初始使用内置区服，刷新后使用新树。

`GET /api/cbg/static?refresh=true` 从以下两个固定 HTTPS 官方地址重新获取，严格提取 JSON 赋值，不执行 JavaScript（无 eval/vm）。服务启动后若完整 JSON 已超过 30 天未同步，会在后台自动执行一次相同刷新：

- [官方游戏配置](https://cbg-yys.res.netease.com/js/game_auto_config.js)：更新御魂套装、收藏目录、式神名称/拼音/稀有度；完整 JSON 长期持久化，未知区块原样保留。
- [官方区服配置](https://cbg-yys.res.netease.com/js/server_list_data.js)：更新区服树。

`refresh` 只接受 `true`/`false` 文本，未知参数一律 400。并发刷新合并为一次，30 秒内再次主动刷新返回 429（失败尝试也参与冷却）；20 秒超时，禁止重定向，Content-Length 与解压后流式体积均限制 32 MiB。两个来源全部取得并通过结构校验后，在同一数据库事务中保存完整游戏 JSON、源文本 SHA-256、同步时间，提交成功才原子替换缓存；御魂目录来自该 JSON，式神数据库目录/面板不由此流程覆盖，继续由人工维护。任何上游或事务失败返回 502，保留旧缓存；事务失败回滚全部数据库写入。重启从数据库恢复游戏配置与手工式神目录；区服树暂不单独持久化，重启使用内置区服。多副本各自维护缓存与冷却。

`source` 为 `bundled`、`database` 或刚成功刷新的 `remote`；`refreshedAt` 为已存官方配置的同步 ISO 时间或 `null`。`heroBaseStatsSource` 为 `bundled`、`database` 或同时使用两者的 `mixed`。数据库 Decimal 保留小数后转为 number，百分数与内置资料统一使用显示单位（暴击率 `5`、暴伤 `150`），不额外乘除 100。官方脚本没有基础面板，刷新只更新已有英雄的 `name`/`slug`/`level`；数据库缺失但内置有可信完整面板时才补入，其他条目不创建虚假或全零面板。`missingHeroIds` 列出官方 `hero_list` 中数据库与内置资料均无面板的条目（也可能包含材料条目）。

`heroCatalog` 按 ID 返回 `{ id, name, rarityCode, slug }` 身份信息，含有官方名称但缺基础面板的式神；这些条目不会进入 `heroes.heroesById`。`collections` 仅从已校验的官方区块构造，各目录为 `Record<string, { name, description?, imageUrl? }>`，说明取官方 `desc`，`imageUrl` 为确认官方模板后生成的图片端点相对路径，不向客户端暴露其他原始字段；缺失区块保持可选，不能据此视为账号未持有。目录包括 `skins`、`premiumSkins`、`specialSkins`、`specialSkins2`、`yards`、`summonRooms`、`heroRooms`、`battleThemes`、`onmyojiRooms`、`frames`、`honors`、`achievements`、`qiling`，另有可选数字数组 `skinBlacklist`。目录总数不代表账号持有数量。

### 收藏图片缓存

`CbgCollectionItem.imageUrl?: string` 示例为 `/cbg/images/headskin/101.png`，固定不含 API 前缀。浏览器以 `@phoenix/config/public-env` 的 `apiBaseUrl` 去尾斜杠后拼接，例如 `/api` + `imageUrl`；服务端继续使用已校验的 `env.baseUrl` 注册全局前缀，不读取本机环境文件。公开语义目录包括 `heroes/<id>.png`、`suits/<id>.png`、`skins/<heroId>/<skinId>.png`、`currency/<id>.png`、`sceneskin/<id>.png`、`decocardhouse/<id>.png`、`headskin/<id>.png`、`badge/<id>.png`、`hunling_pic/<slug>.png`、`yingyuan/<id>.png`。文件域历史资源仍可缓存到 `files/<hostname>/<id>.png`；当前公开目录未发布这类来源，图片端点不接受任意文件 ID。皮肤 ID 与式神 ID 必须存在于已校验官方目录；旧 `/cbg/collection-images` 路由保留兼容历史。图片不依赖进程内查询状态，恢复历史记录后可直接读取。

已确认来源为 [官方角色详情脚本](https://cbg-yys.res.netease.com/mvvm/rc39c7cc66822e3e70f998273d/dist/pdetail-role.js?ae87ac) 与 [官方游戏配置](https://cbg-yys.res.netease.com/js/game_auto_config.js)。图片仅允许来自 `https://cbg-yys.res.netease.com/game_res/` 与官方配置提供的 `https://cbg.fp.ps.netease.com/file/{token}`、`https://cbg2.fp.ps.netease.com/file/{token}`：

| 目录 | 官方来源 |
| --- | --- |
| `skins` | `hero/{heroId}/skin/{id}.png`，优先使用商品保存的配对；阴阳师皮肤可使用上述已验证的皮肤组映射，皮肤 ID 必须在官方目录内 |
| `premiumSkins` | `hero/{heroId}/skin/{id}.png`，heroId 来自商品详情保存的元组，ID 均需在官方目录 |
| `heroes` | `hero/{id}/{id}.png`，限官方式神目录 |
| `suits` | `suit/{id}.png`，限官方御魂目录 |
| 其他目录 | 以下 `/game_res/` 路径模板 |
| `specialSkins`、`specialSkins2`、`heroRooms`、`battleThemes`、`onmyojiRooms` | `currency/{id}.png` |
| `yards` | `sceneskin/{id}.png` |
| `summonRooms` | `decocardhouse/{id}.png` |
| `frames` | `headskin/{id}.png` |
| `honors` | `badge/{id}.png` |
| `qiling` | 官方 `pic`，限定 `hunling_pic/{文件名}.png` |

官方静态配置 `skin_list`、`collection_skin_data` 只有 ID 与名称，不能据此恢复英雄映射。商品详情 `skin.ss/yys/guard` 元组第 1 项为 `heroId`、第 3 项为 `skinId`，响应额外保留去重的 `collections.heroSkinPairs: { heroId, skinId }[]`；前端使用该配对生成典藏与普通皮肤图片地址，服务端按官方目录校验两个 ID 后构造固定官方 URL，不再要求当前进程先查询商品或注册配对，重启与历史恢复可继续读取磁盘缓存。`otherSkins` 与 `onmyojiSkins` 分别展示 `skin.ss`（仅第 4 项为 `true` 的持有项）和 `skin.yys` 中明确分类且出现在官方 `skin_list` 的持有项；其他皮肤中的典藏目录重叠项只在典藏/臻藏页展示。旧历史分类兼容规则见商品查询一节；已确认归属的阴阳师皮肤即使没有 `heroSkinPairs` 也可沿用静态目录图片。其他皮肤若缺配对，仍需重新读取商品补全，不根据皮肤 ID 猜式神。`achievements` 未确认官方图片模板，同样保持缺失。`yaozhige_list` 是混有其他奖励的曜之阁目录，不能映射为御灵皮肤。官方御灵立绘同样取 `skin.guard` 元组构造 `hero/{heroId}/skin/{skinId}.png`（如 `hero/901/skin/419012.png`），但静态配置没有确认的御灵完整分类，因此不发布 `spiritSkins` 目录或图片，收藏图鉴与账号收藏摘要均隐藏该分类；账号 `collections.spiritSkins` 持有 ID 和对应 `heroSkinPairs` 继续保留。头像框多份特例依赖账号持有量，静态目录仅提供基础图片。徽章叠图由 `honors_detail[徽章ID]` 解析为 `collections.honorDojoIds`，每枚徽章优先取 `dojo_id`，其次取 `hero_id`，再沿用官网的最后一个含 `id` 字段；仅保留正整数资源 ID。客户端将对应的 `yingyuan/{id}.png` 前景叠在 `badge/{徽章ID}.png` 上，底图宽高 76%、左偏 12%、距底 1%，前景铺满容器。旧历史若缺映射，需要重新读取商品。

API 完成初始化后检查同步时间，超过 30 天即在后台刷新完整 JSON 和御魂目录；此后每天检查一次，启动不等待网络同步。目录刷新失败时继续使用上次目录；图片仍由现有图片端点按需补齐。后台刷新沿用既有静态资料事务，不增加数据库表或图片数据库写入。

图片持久保存在 API 工作目录下 `data/collection-images/`（本地为 `apps/api/data/collection-images/`，独立部署为部署目录下同路径），请为该目录保留可写持久卷；不包含在源码和发布包中。图片按语义目录存储原始二进制，旁边的 `<image>.meta.json` 仅保存来源、ETag、Last-Modified 和图片摘要，不保存 Base64。相同官方源 URL 共用缓存，重启直接复用磁盘文件。启动先离线迁移旧哈希 Base64 JSON 及哈希图片格式，写入成功后才删除对应旧记录；历史曜之阁图片仅归档到 `legacy/yaozhige/`，不扩大图片接口白名单。非法或迁移失败记录保留，避免丢失旧缓存。使用 ETag/Last-Modified 条件请求，304 继续用旧文件；下载失败、超时、非栅格图片或超限时保留旧图，校验成功才原子替换单个缓存文件。无旧图且下载不可用、未公开目录 ID、缺少式神 ID 或无确认来源时返回 404。

固定 4 并发，单图 15 秒超时，Content-Length 和解压后流式字节同时限制为 4 MiB；仅按 PNG/JPEG/GIF/WebP 文件签名提供图片，拒绝 HTML/SVG。上游地址仅由固定官方模板构造，精确主机/路径白名单，禁止凭据、自定义端口、任意 URL 代理和跳转。定时器不阻止进程退出，模块销毁时清理定时器并中断进行中的图片下载。成功图片响应带 `Cache-Control: public, max-age=3600` 和 `X-Content-Type-Options: nosniff`。

离线检查：`node --test apps/api/checks/collection-images.mjs apps/api/checks/collection-image-binary.mjs`，使用临时磁盘及模拟响应，不访问实际环境、数据库或网络。

## 基础资料入库

API 启动时自动检测 `heroes` 和 `relic_suits` 是否为空，在同一事务中为各自的空表批量写入内置式神面板及御魂目录；只有一张表为空时仅初始化该表。已有记录的表整表跳过，不覆盖手工维护的数据，也不自动补齐非空表中的缺失条目。保留内置面板的数值单位、`lowestRank`、联动标记和御魂逢魔标记；额外属性使用 `null`/`0`。批量插入跳过主键/唯一键冲突，以兼容多个实例同时启动。

初始化先于数据库快照加载完成，不访问网络或登录会话，也不把内置目录冒充为完整官方配置或更新官方同步时间。成功提交后记录实际插入条数；失败全部回滚并记录警告，下次启动重试，读取仍沿用内置资料回退。独立部署启动器先自动执行包内的 `prisma migrate deploy` 准备表结构，成功后才启动 API 执行资料初始化；迁移失败停止启动。启动不会重置或清空表。完整官方 JSON 继续通过原有后台刷新或手动导入持久化，区服树仍沿用内置列表及运行时刷新。

官方刷新在事务内完成配置写入、式神读取和快照生成，提交成功后才发布缓存。失败日志记录具体阶段及允许公开的 Prisma 异常类别/错误码，不输出原始异常消息、SQL 或连接信息；`P2021`/`P2022` 提示核对目标数据库表结构和已提交迁移。初始化及数据库加载失败也记录相同的安全错误标识。仅凭“事务失败”不能判断是否缺表，需结合新日志定位，不能据此重置数据库。

需要手动导入 SQL 或立即同步官方配置时，在仓库根目录运行：

```powershell
pnpm db:import-catalog 'C:\path\heroes.sql' 'C:\path\relic_suits.sql'
# 不需要 SQL 文件，单独同步完整官方配置：
pnpm db:import-catalog --official-only
```

`--official-only` 保存完整 `cbg_game_auto_config`，并按静态刷新相同规则更新已有英雄名称/拼音/稀有度、补入有可信内置面板的缺失英雄；不改已有面板，不创建缺面板英雄，不修改御魂目录。输出 `insertedHeroes`、`updatedHeroes`、`missingPanelHeroes`，分别表示官方同步补入、元数据确有变化、仍缺可信面板的英雄数量；重复同步无变化时插入/更新均为 0。

该命令使用本机 monoenv 的 API 数据库配置，生成 Prisma Client，解析两个 UTF-8 Navicat MySQL 导出，并从上面的固定官方游戏配置地址获取完整 JSON。只解析数据字面量，跳过已知导出包装，绝不执行导出的 DROP/CREATE/SET 或远程 JavaScript；未知语句、重复 ID/slug、非法类型会使导入失败。

- `heroes`：保留原始 16 个字段，包括四位小数基础属性、原始百分数、字符串 `lowest_rank`、联动标记及附加属性。`NULL` 与空字符串分别保留。
- `relic_suits`：保留原始 6 个字段，包括完整套装效果、空两件套属性和逢魔标记。
- `cbg_game_auto_config`：`game_id=yys` 的完整官方 JSONB，含成就、皮肤、头像框、称号、斗技段位等全部区块；同时保存固定来源 URL、源文本 SHA-256 和同步时间。校验当前使用的式神/套装及可选收藏区块结构，其余区块原样保留。

所选 SQL 和官方配置全部获取并解析成功后，在同一事务中按主键 upsert SQL 数据，再同步官方英雄元数据并保存完整配置，失败回滚；重复运行更新同 ID，不清表、不删除未出现在输入中的记录。补入内置面板时沿用内置 `lowestRank`/联动标记，未单列的额外属性用 `null`/`0`；已有数据库的基础面板及附加属性在官方同步时保持原值。官方请求禁止重定向，超时 20 秒，Content-Length 和解压后流式体积均限制 32 MiB。资料作为长期公共基础数据保留，与客户端账号历史独立。

迁移新增两张目录表，并兼容复用结构相同的历史 `cbg_game_auto_config` 表；不修改既有账号表。当前本机库还含本仓库没有的两条历史迁移，已保留数据库中的记录与表；`migrate dev` 会报告既有 drift，不能接受它的 reset 建议。本次通过 `prisma migrate diff` 生成并审阅仅增加目录表的迁移，再用 `prisma migrate deploy` 应用。

静态资料接口及“更新静态资源”按钮使用上节的数据库持久化流程。独立导入后，运行中的 API 可通过显式刷新重新同步，或重启后默认读取新数据库快照；不新增公开原始配置接口。

离线解析检查：`node --test apps/api/checks/catalog-sql.mjs apps/api/checks/cbg.mjs`。

## 本地历史与隐私

- 商品查询按渠道、区服及订单号优先读取 PostgreSQL `AccountSnapshot`，成功取数后的白名单精简商品数据缓存 3 天；命中时不刷新 SID、不检查上游风控暂停状态，也不请求上游。未命中或过期时仍遵守现有会话及风控规则，同一进程内相同商品的并发查询合并。失败响应不缓存；数据库读写失败只记录固定警告并继续正常取数/返回成功数据，不输出原始异常或凭据。
- 复用现有表和迁移：`accountPayload` 保存 `CbgProductData`，`relicVersion=cbg-product-v1` 标识当前格式，`relicPayload={}`（不保存服务端分析结果），`cachedAt`/`expiresAt` 记录缓存时间。旧格式记录不作为命中，仅重新查询同一商品时覆盖；不注册启动、定时或全表快照清理，不批量删除旧记录，也不把旧快照自动搬到浏览器。过期仅表示不再复用，并非自动物理删除。
- 历史记录由客户端保存版本化精简 `CbgProductData` 到本地 IndexedDB，账号/式神/御魂视图按需转换；浏览器存储的保留期限与删除由客户端管理。
- 响应仅包含转换所需的白名单字段，不包含上游 SID、Cookie、卖家联系资料、完整原始 JSON 或追踪参数。商品的公开名称、式神和御魂展示名称仍保留；图鉴名称不保留。
- 本地历史没有应用层静态加密，不宣称端到端加密；清理站点数据会删除浏览器历史。服务监听本机地址，公网 HTTPS 由反向代理提供。

## 服务端配置与检查

在 API 环境配置中设置含 SID 的完整 `CBG_LOGIN_COOKIE`；写入 `.env` 时用双引号包住整个 Cookie（如 `CBG_LOGIN_COOKIE="__网易字段=值; sid=你的SID"`），避免 `#` 等字符被 dotenv 当作注释截断。初始 SID 仅从此 Cookie 读取。只修改被 Git 忽略的本机配置，不提交真实值，不添加 `NEXT_PUBLIC_` 前缀。模板空值允许 API 启动，但官方查询不可用。其他渠道不携带官方 SID。

无真实凭据、数据库和网络的定向检查：`node --test apps/api/checks/cbg.mjs`（含真实共享 converter 的剪枝前后等价断言、递归隐私剪枝、商品数据库缓存命中/过期/渠道隔离/并发合并/失败降级、SID single-flight/隐私、风控、静态更新/失败保留和打包转译检查）。完整代码检查：`pnpm lint`、`pnpm typecheck:api`。检查不代替有授权的真实上游/数据库集成验证。

独立 API 打包脚本包含环境运行包、转译为纯 ESM JavaScript 的共享 utils、编译器输出的内置 JSON、`prisma/schema.prisma`、完整 `prisma/migrations/` 和 `prisma.config.cjs`，并将已安装的 Prisma CLI 精确版本加入部署包生产依赖。`node phoenix.js` 按需安装依赖（包括旧包升级后新增的 Prisma CLI），每次启动先应用待执行迁移，成功后才启动 Nest。迁移与服务共用 `.env` 或 `PHOENIX_ENV_FILE` 指定的环境文件，平台已有环境变量优先；服务器角色需具备所需建表权限。迁移失败停止启动；已有表但缺少迁移历史时需核对后显式建立基线，不自动标记迁移已执行。启动器不运行 `migrate dev`、`db push` 或 reset。无须在服务器读取 monorepo 的 TS 源码；Node.js 24.15+ 的 CommonJS API 可以加载同步 ESM utils。部署模板包含空 `CBG_LOGIN_COOKIE`，真实值只在服务器配置；缺少有效 SID 且没有有效商品缓存时，官方渠道商品查询仍返回 503，和建表流程独立。打包/构建会产生并覆盖部署目录，必须获得明确授权后才执行。

部署启动离线回归：`node --test apps/api/checks/deployment.mjs`，在内存中模拟部署脚本的文件/进程 IO，检查迁移资源打包、启动顺序、升级补装和失败中止；另在一次性临时目录中写入生成的 CommonJS 配置及共享环境运行包，以隔离进程、虚拟环境文件调用真实 Prisma 配置加载器，检查导出格式、环境文件选择和路径解析。配置直接使用 `module.exports` 导出配置对象，避免 TypeScript 的 `exports.default` 模块包装被误判为非法配置字段。检查不读取真实环境文件，不执行真实打包、安装或数据库迁移。
