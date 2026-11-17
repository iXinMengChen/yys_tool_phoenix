# API 应用约定

本文件适用于 `apps/api/`，同时遵守仓库根目录 `AGENTS.md`。具体目录、命令和依赖以本地实现为准。

## NestJS 结构与职责

- 当前提供健康检查、藏宝阁 Web 上游适配与公共资料/图片服务、桌面发布版本查询，以及 Swagger 和通用请求/响应处理；具体路由以 `API.md` 和已注册模块为准。桌面账号搜索和御魂分析在本机执行，不为目录迁移恢复旧版服务端搜索、分析或摘要上传接口。
- `src/main.ts` 负责应用启动和全局设置，`AppModule` 负责组合模块。新增实际业务时按功能创建模块；Controller 处理 HTTP 边界，Service 承担业务逻辑，依赖通过 Nest 模块注入。不要为暂不存在的功能创建空模块、Service 或基类。
- NestJS DTO 使用运行时类与 `class-validator`，由 `main.ts` 的全局 `ValidationPipe` 执行转换、白名单和额外字段拒绝。DTO 运行时导入，不使用 `import type`；简单单值参数优先使用 Nest 内置解析管道。Nest DTO 不使用 Zod。
- 修改或新增接口时更新 Swagger 装饰器及 `API.md`，并检查 `packages/types` 的公开契约、Next.js 代理路径和调用方。

## 响应与错误

- 成功和异常响应由全局拦截器、异常过滤器统一封装。Controller/Service 返回业务数据或抛出 Nest 异常，不手工重复包装响应。
- HTTP 状态使用 Nest `HttpStatus`；沿用 Nest 异常表达失败，不吞错、不伪造成功。5xx 对客户端只返回通用提示，详情留在服务端日志；不要记录 Cookie、令牌或完整敏感请求内容。
- 只在能恢复、补充上下文或转换边界错误时捕获异常。

## 环境与数据库

- 应用环境从 `src/env.ts` 导出的 `env` 使用；业务模块不要直接读取 `process.env`。必需配置在服务启动时校验，错误信息不得回显敏感值。
- PostgreSQL 只由 API 访问。Prisma 的实际配置、schema 和迁移分别位于 `prisma.config.ts`、`prisma/schema.prisma`、`prisma/migrations/`；生成客户端位于被忽略的 `src/generated/prisma/`，不得手工编辑。使用现有 `PrismaService` 和 Prisma 7 PostgreSQL adapter。
- `AccountSnapshot` 按渠道、区服和订单号缓存白名单精简商品数据 3 天；`accountPayload` 保存 `CbgProductData`，`relicVersion=cbg-product-v1` 标识当前格式，`relicPayload` 留空对象，不保存服务端分析结果或凭据。旧格式不直接复用，不擅自批量清理历史记录。新增持久化业务前先确认字段、数据用途及保留策略。
- `ProductSummary` 接收用户明确授权的商品文本摘要上传，以渠道、区服、订单号更新；来源为未经核实的 `client_upload`，保留三个 UTC 自然月，启动及每小时清理过期数据，不自动上传桌面原始账号。商品缓存只清理已过期的 `cbg-product-v1`，旧格式历史保持不动。
- 迁移只能通过 Prisma 迁移命令创建和应用；不得擅自 reset/drop 数据库、删除迁移或手改生成代码。数据库变更前核对迁移内容与目标环境。

## 检查与常用命令

- API 改动后通常运行 `pnpm lint` 与 `pnpm typecheck:api`；跨包契约变更运行 `pnpm typecheck`。`pnpm db:generate` 不需要连接数据库；数据库初始化和迁移命令需要有效的本机配置。
- `pnpm package:api` 会构建并生成独立的 `deploy/`，源码打包脚本位于仓库根 `scripts/`，产物复制编译文件、共享环境加载器和运行依赖清单，不包含 `node_modules` 或真实环境文件。服务器需提供 PostgreSQL，在 `.env` 配置 API 变量后运行 `node phoenix.js`；首次启动自动安装生产依赖。API 绑定 `127.0.0.1`，公网部署需由同机反向代理转发。
- 当前没有统一测试脚本。按实际改动做定向验证；未经用户明确要求不运行 build、重置数据库或启动额外服务。
- 纯文档修改核对 `git diff --check` 即可。结束前检查差异，保留其他未提交改动。

参考：[NestJS Modules](https://docs.nestjs.com/modules)、[NestJS Validation](https://docs.nestjs.com/application/validation)、[Prisma PostgreSQL drivers](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers)。
