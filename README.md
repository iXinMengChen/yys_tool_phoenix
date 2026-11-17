# Phoenix

本项目采用 [Phoenix 非商业使用许可证](LICENSE)：允许非商业用途的使用、学习、修改和分发；未经相关著作权人另行书面授权，禁止商业使用，包括收费服务、广告获利、商业引流及商业产品集成。分发时须保留版权、来源声明和许可证。第三方依赖、游戏素材与数据遵循各自权利及许可。本项目属于源码可用项目，因包含非商业限制，不属于 OSI 定义的开源软件。

天真工具箱的 Phoenix 实现，采用 pnpm workspace 与 Turborepo 管理。首页是工具箱欢迎页；「号来 · Phoenix」提供阴阳师藏宝阁账号查询、速度盘点、PVE 预览、式神技能、御魂库存和单人御魂搭配计算。Web 通过 NestJS API 读取上游与 PostgreSQL，计算算法由共享纯逻辑包提供，耗时搜索运行在浏览器 Worker 中。

- `apps/web`：Next.js 前端，路由位于 `app/`，默认运行在 `http://localhost:24974`
- `apps/api`：NestJS API，默认运行在 `http://127.0.0.1:43127`
- `apps/desktop/haolai`：独立 Tauri 2 桌面应用，只保留号来，已迁入 Web 的全部七个业务页，启动直达账号查询；本地登录/读取藏宝阁，复用共享 UI、算法与 Web 静态资源；运行与限制见 [桌面文档](apps/desktop/haolai/README.md)。
- `packages/ui`：共享 UI 组件、hooks 与唯一全局主题样式；`src/pages` 存放 Web 与桌面共用的页面，业务组件并入 `src/components`，计算 Worker 位于 `src`；应用只提供账号数据和平台适配
- `packages/api-client`：共享 API 请求封装
- `packages/types`：前后端共享类型
- `packages/utils`：共享纯逻辑工具
- `packages/config`：共享 ESLint 与 TypeScript 配置

## 页面与共享算法

- `/`：天真工具箱欢迎页；旧 `/tools` 跳转到这里，不另设工具中心导航。
- `/yys-cbg-inspector/home`：号来账号查询、概览、摘要复制及最近查询。
- `/yys-cbg-inspector/speed`：散件/套装速度、独立配速与御魂证据。
- `/yys-cbg-inspector/pve`：有效词条评分、套装排名和伤害预览。
- `/yys-cbg-inspector/hero-skills`：式神技能筛选与统计。
- `/yys-cbg-inspector/calculator`：式神基础面板、主属性、套装、面板约束、额外加成、单人御魂计算；可停止 Worker、保存单人配置，并排除已保存方案的御魂。
- `/yys-cbg-inspector/relics`：御魂库存筛选、排序和强化明细。
- `/yys-cbg-inspector/collections`：仅展示账号已拥有的收藏，支持按名称、描述和编号搜索及说明弹窗；账号查询页同步展示收藏摘要。未拥有和持有情况未知的条目不展示，旧历史缺少持有数据时提示重新读取商品链接。

`/yys-cbg-inspector` 跳转到账号查询；上述页面不带前缀的旧地址永久跳转到新地址，并保留查询参数。启动 Web 后可运行 `node apps/web/checks/routes.mjs http://localhost:24974` 验证新路由与旧地址跳转（端口按实际运行地址调整）。

工具箱首页隐藏侧栏；七个业务视图显示持续挂载的侧栏。账号状态全站共用，菜单切换只更新右侧内容，返回首页再进入功能也保留当前账号。选中背景平滑移动，页面内容立即切换，不等待动画；遵循系统减少动态效果设置。桌面端缓存已访问页面的实例、组件状态和滚动位置，切换菜单不中断计算或后台搜索，窗口关闭后释放缓存。地址、深链接与浏览器前进后退保持可用。精简账号数据与读取时的套装索引保存在此浏览器 IndexedDB，刷新后点击“最近查询”即可恢复，不请求商品接口；最近 12 个账号不按天过期，超出后替换最早读取的账号。旧链接记录保留并标注，重新读取一次后转为本地数据记录。历史为读取时的快照，重新提交链接仍可能命中服务端 24 小时商品缓存，最新售价和库存以藏宝阁页面为准。服务端取数、校验、剪枝并缓存精简商品数据；账号、式神与御魂视图由浏览器 Worker 拆解，强化阶段打开详情时生成。算法与类型的公开导出见 [utils 文档](packages/utils/README.md) 和 `packages/types/src/index.ts`。服务端登录状态不接受来自浏览器的 SID 输入，配置与刷新接口见 [API 文档](apps/api/API.md)。

## 本地开发

项目需要 Node.js 24.15 或更高版本，包管理器使用 pnpm（版本见根 `package.json` 的 `packageManager`）。

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动 Web/API（不启动桌面）；也可用 `pnpm dev:web` 或 `pnpm dev:api` 单独启动。这些启动脚本都会先通过 monoenv 生成环境文件。独立桌面运行 `pnpm dev:desktop`，类型检查运行 `pnpm typecheck:desktop`，不依赖 Phoenix API/数据库。

前端 API 请求会由 Next.js 转发到 NestJS。默认前缀为 `/api`，健康检查地址为 `http://localhost:24974/api/health`，也可直连 `http://127.0.0.1:43127/api/health`。Next.js rewrite 根据 `NEXT_PUBLIC_API_BASE_URL` 生成转发路径，该值需与 NestJS 的 `API_BASE_URL` 一致。

Swagger 文档页默认位于 `http://localhost:24974/api/docs`，API 直连地址为 `http://127.0.0.1:43127/api/docs`；OpenAPI JSON 地址为 `/api/docs-json`。

API 成功响应统一使用 `{ code: HttpStatus.OK, message: 'success', data }`；异常响应使用 `{ code: HTTP状态码, message, data: null }`，并保留真实 HTTP 状态码。服务端用 Nest `HttpStatus` 常量，不在中间件里写裸数字；共享请求封装返回完整信封，前端可展示 `code`，但使用 HTTP 状态区分成功与失败。所有 5xx 异常对客户端返回通用提示，详细信息只写入服务端日志。

## 环境变量

首次使用时复制模板作为本机配置：

```powershell
Copy-Item .monoenv.example.yaml .monoenv.yaml
```

`.monoenv.yaml` 仅保存在本机并由 Git 忽略；所有应用共用它，由 monoenv 在启动或构建前生成根目录 `.env`，应用再通过 `packages/config` 读取。需要共享的非敏感默认值请修改 `.monoenv.example.yaml`。

Next.js 与 NestJS 启动时会用同一份 Zod schema 校验项目声明的全部环境变量；必填项缺失或格式错误会立即报错，错误信息不会显示变量值，并会提示实际尝试读取的环境文件路径。默认端口只在 `.monoenv.example.yaml` 中声明，环境加载器不再内置第二份默认值。

前后端共用 `packages/config/env.ts` 的变量定义并按应用取子集：NestJS 用 `apps/api/src/env.ts` 导出的 `env.apiPort`，Next.js 服务端用 `apps/web/src/env.server.ts` 导出的 `env.webPort` / `env.apiProxyUrl` / `env.apiBaseUrl`。校验在启动时完成——这两个模块被 import 即解析并冻结配置，变量有误会直接退出，不会带着坏配置开始服务；同时每个应用只校验自己需要的变量，新增单端变量不会牵连另一个应用。环境文件默认按应用工作目录读取 `../../.env`，部署布局不同时可用 `PHOENIX_ENV_FILE` 指定路径。

共享 API client 不读取环境变量，也不预设 timeout：应用通过 `createApiClient({ baseURL: env.apiBaseUrl, timeout: 10_000 })` 创建实例，浏览器侧使用 `NEXT_PUBLIC_API_BASE_URL` 指定前缀。

浏览器组件只能引用 `@phoenix/config/public-env` 导出的 `apiBaseUrl`（不含 zod 和 Node API）；`NEXT_PUBLIC_*` 在构建时内联，改值后需要重新构建。服务端继续用 `@phoenix/config/env`。

- `API_PORT`：NestJS API 监听端口，模板默认 `43127`。
- `API_BASE_URL`：NestJS 全局路由前缀，模板默认 `/api`。
- `DATABASE_URL`：NestJS 连接 PostgreSQL 所需的连接地址，需在本机 `.monoenv.yaml` 中配置。
- `PORT`：Next.js Web 端口，模板默认 `24974`；Web 启动入口会先读取 monoenv 生成的根 `.env`，再启动 Next CLI。
- `API_PROXY_URL`：Next.js 转发 API 的必需源地址，模板默认 `http://127.0.0.1:43127`。
- `NEXT_PUBLIC_API_BASE_URL`：浏览器请求前缀，模板默认 `/api`；Next.js 使用它配置代理路径，需与 NestJS 的 `API_BASE_URL` 一致。

修改 `.monoenv.yaml` 后，运行根目录的启动或构建脚本会重新生成 `.env`；生成文件已加入忽略规则。

## 桌面版本发布与升级引导

在仓库根目录运行 `pnpm version:desktop 1.0.0-beta.10` 设置桌面版本（将参数替换为目标 SemVer）。命令同步桌面的 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock`，仅修改本地版本元数据，不构建、打包或更改 API 的发布配置。

`GET /api/desktop/version` 从 PostgreSQL 的 `DesktopRelease` 表实时读取 `publishedAt` 最新的一条记录，沿用 API 的 `{ code, message, data }` 响应格式。无记录时 `data` 为 `{ configured: false }`；有记录时返回原有契约 `{ configured: true, version, downloadUrl, notes }`，其中 `downloadUrl` 是引导用户前往小飞机网盘的真实 HTTPS 分享链接。接口不读取账号或登录会话，不提供公开写入接口，也不缓存结果；数据库修改会立即生效，无需重启 API。

发布版本由数据库维护而非环境变量。`DesktopRelease` 字段为：`version`（主键）、`downloadUrl`（真实 HTTPS 网盘分享 URL）、`notes`（默认空字符串）、`publishedAt`（发布时间）。请先应用 Prisma 迁移，再由受控数据库运维流程录入版本、真实分享链接、说明和发布时间；当前暂无正式发布日志，`notes` 留空。本次迁移已录入 `1.0.0-beta.10`，下载入口为 [小飞机网盘](https://share.feijipan.com/s/4b7LXxbh)。桌面默认请求 `https://mxtsl8.cn/phoenix-api/desktop/version`，也可在 monoenv 的 `apps.desktop` 下用 `VITE_DESKTOP_VERSION_URL` 覆盖；桌面本地版本从 Tauri 读取，发现更高版本后引导用户手动打开网盘链接，不执行自动下载或静默升级。详见[接口文档](<apps/api/API.md>)和[桌面文档](<apps/desktop/haolai/README.md>)。

## PostgreSQL 与 Prisma

NestJS API 使用 Prisma ORM 7 连接 PostgreSQL。请在本机 `.monoenv.yaml` 的 `apps.api` 下设置 `DATABASE_URL`；连接凭据不要提交到仓库。API 启动时会校验 URL 并连接数据库，数据库不可用时 API 不会启动。

```yaml
apps:
  api:
    DATABASE_URL: postgresql://USER:PASSWORD@127.0.0.1:5432/yys_data_phoenix?schema=public
```

本地启动 API 时会自动根据 `DATABASE_URL` 创建缺失的 PostgreSQL 数据库并应用已提交的 Prisma 迁移，无需先手动建库；缺库时连接角色需要 `CREATEDB` 权限。也可运行 `pnpm db:init` 手动准备数据库并生成客户端。商品接口复用现有 `AccountSnapshot` 按渠道、区服和订单号缓存白名单精简商品数据 3 天；命中不请求上游，过期重新获取，仅新格式记录参与复用。同一商品并发请求在进程内合并，数据库读写失败不阻断正常查询；不新增迁移或批量清理旧数据，也不缓存分析结果及凭据。公共基础资料另存于 `heroes`、`relic_suits` 和 `cbg_game_auto_config`。浏览器使用 IndexedDB 保存最近 12 个账号的精简原始数据和套装索引，不按天过期；历史列表恢复时由 Worker 重新拆解，不请求商品接口。Web 同时整体缓存公共 JSON 资料（式神面板、御魂套装、区服列表、式神身份及收藏目录）：24 小时内优先使用本地缓存，过期后在下次加载时自动尝试更新并先显示旧资料；“更新资料”强制联网，同一页面内并发请求合并。自动更新失败保留旧值供离线使用，浏览器存储不可用时仍可联网读取；手动更新失败会报告错误，不伪装成更新成功。查询历史可从界面清除；清理站点数据会删除全部浏览器存储。旧版本只有链接的历史不会凭空变成数据，需要主动读取一次。SID/Cookie 不进入本地历史或公开响应；本地历史没有应用层静态加密。用户主动保存的计算配置继续保存在浏览器。生成客户端位于 `apps/api/src/generated/prisma/`，由 API 的开发、类型检查和构建脚本自动更新，不要手工修改。

生产部署时在运行平台设置同名变量；外部环境变量优先于生成的 `.env`。敏感值放在部署平台，不要写入仓库配置。

## API 部署包

在仓库根目录运行发布命令；项目的 Node 运维脚本源码集中在 `scripts/`：

```bash
pnpm package:api
```

将 `apps/api/deploy/` 整个目录复制到服务器（例如 `/srv/phoenix-api`），再配置并启动：

```bash
cd /srv/phoenix-api
cp .env.example .env
# 编辑 .env 中的 PostgreSQL DATABASE_URL
node phoenix.js
```

首次运行会自动安装生产依赖；旧包升级后缺少 Prisma 工具时也会补装。每次运行 `node phoenix.js` 先执行 `prisma migrate deploy`，应用包内尚未执行的迁移，自动创建所需表，然后启动 API 并初始化空的资料表。迁移失败会停止启动，不重置或清空数据库；已有表但没有迁移历史的数据库需先人工核对并建立迁移基线，不能自动冒认迁移已执行。部署目录不含 `node_modules`，包含共享运行包、Prisma CLI 生产依赖、schema、完整迁移目录和编译后的迁移配置。服务器需预先运行 PostgreSQL，配置正确的 `DATABASE_URL` 并授予迁移所需权限。API 默认监听 `127.0.0.1:43127`，公网访问请通过同机 Nginx 等反向代理转发。构建与运行需 Node.js 24.15+。

## Web 部署包

在具备完整开发依赖的构建环境中，配置生产环境的 Web 变量后运行：

```bash
pnpm package:web
```

命令会生成独立的 `apps/web/deploy/`，目录根部包含 Next standalone 的 `server.js`、一键入口 `phoenix.js`、`.next/`、`public/`、`.env.example` 和不含工作区链接的 `package.json`，不包含 `node_modules`。把整个目录复制到服务器（例如 `/srv/phoenix`），然后运行：

```bash
cd /srv/phoenix
cp .env.example .env
# 按需修改 .env 里的 PORT
node phoenix.js
```

首次运行会自动安装生产依赖并启动 Next.js，后续运行会直接启动。入口先读取 `.env`，服务器环境中已设置的变量优先；监听地址固定为 `0.0.0.0`，避免 Linux 主机的 `HOSTNAME` 被误当成网络地址。Next 部署目录不依赖 monorepo；号来业务仍需要可访问的 Nest API 与 PostgreSQL，欢迎页可以独立访问。

`API_PROXY_URL` 和 `NEXT_PUBLIC_API_BASE_URL` 会在构建时写入 Next.js 输出。修改后需重新运行 `pnpm package:web`；同机 API 默认目标为 `http://127.0.0.1:43127`，浏览器前缀为 `/api`。Web 可以单独启动并显示欢迎内容；共享侧栏会尝试读取 API 会话与静态资料，首次读取商品和更新资料需要 API 可用；已保存的账号可结合最近可用的本地公共资料恢复分析。构建和部署时使用 Node.js 24.15+。

## API 会话与资料更新

- 在 API 服务端配置 `CBG_LOGIN_COOKIE`（含 SID 的完整登录 Cookie；写入 `.env` 时必须用双引号包住整个 Cookie，避免 `#` 等字符被 dotenv 截断）；初始 SID 仅从此 Cookie 读取，缺少有效 SID 时官方账号查询不可用。在被忽略的本机 monoenv 配置或服务器部署环境设置，不传给网页，也不添加 `NEXT_PUBLIC_`。官方账号查询自动刷新 SID，并同步成功响应中的 `NTES_SESS` 等登录 Cookie；刷新失败保留上一份完整会话。刷新值仅保存在进程内存，重启恢复配置值；不提供密码登录，已失效或被撤销的凭据仍需重新登录获取。公开会话状态只含 `configured`/`refreshedAt`，没有浏览器设置 SID 的入口。
- 静态资料默认读取数据库中的完整官方配置与式神面板，缺失面板回退到可信内置资料。主动更新从两个固定官方 JSON 赋值脚本获取，绝不执行远程 JavaScript；先校验，再以事务保存完整游戏配置并同步式神名称/拼音/稀有度，提交成功后替换缓存。官方无基础面板的新增条目保留身份和缺失提示，不伪造面板；完整游戏配置、收藏目录和英雄资料重启后可从数据库恢复，区服树重启使用内置列表。参数、刷新冷却和边界见 [API 文档](apps/api/API.md)。
- 收藏图片在 API 初始化后后台同步，此后每 24 小时按最新官方目录刷新全部已确认资源；并发 4、单图 4 MiB/15 秒，禁止跳转与任意 URL 代理。图片写入 API 工作目录 `data/collection-images/`，重启复用，更新失败保留旧图。部署时为该目录保留可写持久卷；图片不需要数据库结构变化。公开目录的可选 `imageUrl` 为不含 API 前缀的 `/cbg/images/<semantic-path>.png`，浏览器拼接公开 `apiBaseUrl`；旧 `/cbg/collection-images` 路由保留兼容历史。图片缓存使用真实图片与小型 meta 文件，启动时离线迁移旧 hash JSON；旧 yaozhige 图片仅迁移到 legacy 目录，不作为新白名单来源。来源与离线检查见 [API 文档](apps/api/API.md)。
- 基础资料入库：API 每次启动先检查 `heroes` 和 `relic_suits`，仅对空表在同一事务内写入内置式神面板和御魂目录；不依赖网络或登录 Cookie，不覆盖已有表数据。提交成功后才加载数据库快照，初始化失败回滚、记录警告并在下次启动重试，仍可回退到内置资料。需要手动导入 SQL 时，在根目录运行 `pnpm db:import-catalog '<heroes.sql路径>' '<relic_suits.sql路径>'`，将两份导出的全部字段和完整官方游戏配置 JSONB 写入 API 数据库；`pnpm db:import-catalog --official-only` 可独立同步官方配置。输入全部校验后事务 upsert，可重复运行，不执行原 SQL 的删表语句。保留来源 URL、SHA-256 与同步时间；页面通过静态资料接口读取这些数据库资料；独立导入后，运行中的 API 可显式刷新或重启读取新快照。迁移兼容既有官方配置表，不重置数据库。详见 [API 文档](apps/api/API.md)。
- API 部署包还会包含转译为普通 ESM JavaScript 的共享 utils 与内置 JSON；服务器无须加载 monorepo TS 源码。启动器会检查环境/算法运行包是否缺失，再按需安装生产依赖。源码修改未替代实际打包验证；构建/打包须另行明确授权。
