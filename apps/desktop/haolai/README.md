# 号来 Phoenix 桌面端

独立 Vite + React SPA / Tauri 2 应用。HashRouter 管理内部页签，不向 Web 增加桌面入口，也不嵌套 Next.js。

## 开发与检查

从仓库根运行：

```powershell
pnpm install
pnpm dev:desktop
pnpm typecheck:desktop
node --experimental-strip-types --test apps/desktop/haolai/checks/*.test.mjs
pnpm package:desktop
pnpm package:desktop:installer
pnpm package:desktop:portable
```

桌面发布产物统一整理到 `apps/desktop/haolai/release/tauri/`：`installer/` 保存 NSIS 安装包，`portable/<产品名>-<版本>/` 保存可直接运行的程序和 `static-data/assets/`。安装版与免安装版均包含 Phoenix `LICENSE`，发布脚本会在打包前检查它与仓库根目录的许可证一致。完整打包生成两类产物；两个带后缀命令只生成对应类型。打包需要 Rust、Windows WebView2 和系统编译工具。

仅预览 UI 可运行 `pnpm --filter @phoenix/haolai-desktop dev`，端口 `12832`；普通浏览器没有本地藏宝阁桥，取数、登录和原生操作会明确报不支持。Tauri 开发需要 Rust、Windows WebView2 和系统编译工具。未经明确要求不执行 build/打包。

根 `pnpm dev` 仍只启动 Web/API，不启动桌面窗口。桌面不读取 Phoenix API 环境变量，不要求数据库启动。

菜单切换不等待滑块动画，也不播放内容入场动画。页面首次访问时创建，后续切换保留页面实例、组件状态与滚动位置；未选中页面通过原生 `hidden` 隐藏，不卸载或中断计算和后台搜索，关闭窗口后释放缓存。切换账号时分析页仍按账号来源重置。

## 数据边界

- 藏宝阁登录、搜索、商品请求在同渠道远程 WebView 内完成；账号解析与御魂搜索在本机 JS/Worker 执行。
- Windows 登录会话使用 DPAPI 保存到桌面用户目录，不读取旧仓库或复制用户 Cookie。
- 已移除旧版商品读取后的自动摘要上传命令和调用。
- 主动商品请求保持串行，每次使用独立请求身份和结果槽；超时撤销，迟到响应不能满足下一次取号，也不进入页面自动同步。
- 公共英雄/套装资料的手动更新目前仍使用旧公共资料服务；区服、图片和缺失商品详情直连网易。此版本不是全离线应用。
- Phoenix 使用独立标识 `com.phoenix.yys.cbg.inspector` 和程序名“号来 Phoenix”，不继承旧版安装/数据目录；旧登录状态不自动迁移，需要重新登录。
- 已删除旧版 updater/process 插件依赖与注册、更新端点、公钥和更新权限。关于页仅检查 Phoenix 发布版本并引导打开 HTTPS 下载页面手动安装，不下载、不自动安装。NSIS 钩子拒绝安装到含旧版程序的目录；发布前仍须配置 Phoenix 自己的签名并实际验证安装行为。

## 版本检查与手动升级

桌面默认使用 `https://mxtsl8.cn/phoenix-api/desktop/version` 检查版本，无须额外配置。可选公开变量 `VITE_DESKTOP_VERSION_URL` 可覆盖为其他完整版本接口地址，通过根 monoenv 的 `apps.desktop` 或进程环境配置，不新增桌面独立环境文件；空值沿用默认接口。Vite 在启动/构建时读取，修改后需重新启动开发进程；分发包需重新生成。该值不是秘密，禁止嵌入凭证。

配置版本接口后，原生应用启动时检查一次；发现较新版本时显示可关闭的下载提醒。关于页的“启动时提醒新版本”开关保存在本机，关闭后连同正在等待的检查结果都不再展示；手动检查仍然可用。下载按钮只打开浏览器，防止重复点击，并在打开失败时显示可重试的错误。

关于页按钮通过专用 Tauri IPC/reqwest 请求，预览浏览器明确不支持，不受浏览器 CORS 影响。不复用藏宝阁 Cookie/会话，不跟随重定向；12 秒超时、64 KiB 响应上限。生产仅接受 HTTPS，debug 可访问本机 loopback HTTP。API 全局响应为 `{ code: 200, message: 'success', data }`，`data` 是 `{ configured: false }` 或 `{ configured: true, version, downloadUrl, notes }`，后者三字段均为字符串。SemVer 比较包含预发布优先级，忽略 build metadata；仅远端严格较新时出现下载按钮，未知或无效响应显示错误。下载地址在前端与原生两次验证 HTTPS 且不含 URL 凭证，再用系统浏览器打开；版本下载使用专用原生命令，不依赖通用 JS opener 权限，也不会自动安装。具名外部浏览器仅额外允许六个已支持的藏宝阁主机及旧版参考源码地址，不允许任意程序。

## 共享资源与逻辑

- Vite 禁用 `publicDir` 复制；少量界面必需图标来自 `packages/assets/haolai`，Tauri 打包映射到程序目录的 `static-data/assets`，免安装版也保留相同目录，不依赖部署后的 Web 服务器。
- 游戏资源按需读取：公共 JSON 首次使用时加载并保存到可执行文件旁的 `static-data/`；图片在页面实际请求且本地缺失时才下载到 `static-data/assets/`。启动、读取商品及手动更新资料均不再全量预下载图片；已缓存的有效资源可离线复用。账号历史和登录数据的位置不变，旧用户目录中的资源缓存不删除。
- 原生 `yys-cbg-assets` 协议优先读程序目录缓存，再读内置资源；debug 模式回退到仓库共享目录。Windows 显示的 `http://yys-cbg-assets.localhost` 是本机资源协议，不是项目服务器。UI 文件在共享目录根部，协议保持 `/ui/<name>` 兼容路径。
- 式神、御魂、皮肤与收藏图标直接使用藏宝阁官方 `https://cbg-yys.res.netease.com/game_res/` 地址，不通过 Phoenix 服务器或 Web 图片代理。式神基础面板等 JSON 资料的更新来源与图片下载独立。安装目录必须允许当前用户写入；若放在受保护目录，请使用当前用户可写的安装位置，不自动退回用户数据目录或提权。
- 商品链接、账号/式神/御魂转换、强化详情、账号/御魂盘点与一速组合、独立多套一速算法复用 `@phoenix/utils`；账号、数据集、御魂、强化及分析类型复用 `@phoenix/types`；Web 与桌面头像的失败状态复用 `@phoenix/ui/hooks/use-image-fallback`。桌面适配层只保留原始响应包装、列表轻量模式、旧典藏计数及其追加评分和按阶段显示的兼容逻辑；典藏维度不写入共享规则，原卖点顺序与总分口径保持不变。
- 桌面端只保留号来，启动直接进入账号查询，不包含工具箱欢迎页和首页导航。已迁入当前 Web 的全部七个业务页：账号查询、速度盘点、PVE 预览、式神技能、收藏图鉴、御魂计算器、御魂库存。分析页面、组件与计算 Worker 从 `@phoenix/ui/pages` 引入，Web 与桌面执行同一份源码，不再分别维护页面副本。两端共用 `@phoenix/ui/styles/globals.css`，桌面没有独立全局 CSS；Web 的 CSS 入口也只引用该共享样式。应用层保留账号 context、登录/读取与图片地址/导航适配，Web 应用源码不作为桌面的运行时依赖。
- 桌面额外提供独立账号搜索页（`/account-matcher`，包含条件筛选、候选结果、本地匹配和后台搜索）、登录渠道选择、藏宝阁独立窗口自动读取、本机历史清理、浅深主题和设置/手动更新页。桌面 `/` 直接显示账号查询，分析页使用 `/speed`、`/pve` 等独立路径；没有工具箱首页，不沿用 Web 的业务路径前缀。已移除不再使用的旧桌面页面及其专属代码；应用层仅维护平台适配、桌面外壳与原生专属界面。旧版离线评分等仍有回归用途的纯逻辑按实际调用保留。桌面不依赖 Sass。原生藏宝阁窗口页面使用共享 Tailwind 样式。
- 收藏目录与区服分组由原生端读取网易公共静态资料并缓存；式神与御魂图标走本地资源协议，皮肤图片按式神/皮肤 ID 读取。暂不支持的收藏图片不请求 Phoenix 代理图片接口。

## 原生模块

`src-tauri/src/lib.rs` 只负责插件、托盘、资源协议和命令注册。藏宝阁逻辑在 `cbg/` 中按职责维护：`session.rs` 管理登录和 Cookie，`windows.rs` 管理窗口，`webview.rs` 负责页面脚本桥接，`product.rs` 读取商品，`search.rs` 处理角色搜索。`assets.rs` 负责图片资源及缓存，`static_data.rs` 负责公共静态资料，`release.rs` 负责版本检查，`platform.rs` 负责平台辅助能力。拆分不改变前端 IPC 命令名称与参数。

## 验证范围

桌面 Node 回归覆盖共享页面/样式来源、即时导航、页面缓存与快速切换、图片失败状态、Worker 模式、资源白名单、禁止摘要上传、本地响应转换、旧版离线评分、独立多套一速、商品请求竞态、版本检查及独立安装标识。Rust 单元测试覆盖链接与响应解析、登录状态、静态资料和资源路径等原生纯逻辑。

原生修改在 `src-tauri` 运行 `cargo fmt --check`、`cargo check` 和 `cargo test --lib`。类型检查、源码断言与单元测试不能代替真实 Tauri 登录、商品读取、窗口/托盘、搜索和安装验证；执行结果与尚未实测的项目在任务交付时单独说明。
