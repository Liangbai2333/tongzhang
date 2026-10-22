# 同账 TongZhang

多人共享记账与结算移动端 App。React Native / Expo + Fastify + PostgreSQL，全栈 TypeScript。

当前完成工程骨架：移动端联调页、API 健康检查与接口文档、共享包、数据库连接、开发配置和 CI。登录、账本、邀请、记账及结算业务尚未实现；应用图标和启动图暂用 Expo 模板资源。

## 快速开始

环境：Node.js 24、pnpm 12.6.0、已启动的 Docker Desktop。

```bash
pnpm install
pnpm env:setup
pnpm db:up
pnpm db:migrate
pnpm dev:api
```

另开终端启动移动端：

```bash
pnpm dev:mobile
```

移动端默认使用 Development Build。首次安装开发客户端、配置真机 IP、Expo Go 临时预览等步骤见 [开发说明](docs/development.md)。

API 默认 `http://localhost:3300`：

- `/health/live`：进程存活，不依赖数据库。
- `/health/ready`：真实 PostgreSQL 连接检查，失败返回 503。
- `/api/v1/system/info`：项目基础约定，验证两端共享接口。
- `/docs`：开发环境 Swagger UI。

## 目录

```text
apps/mobile       Expo Router、联调页、主题与请求封装
apps/api          Fastify、数据库插件、系统接口与测试
packages/contracts  Zod 请求/响应 Schema
packages/domain     整数金额纯函数
docs              架构、业务、原型、开发说明
infra             PostgreSQL、API 容器、Caddy
scripts           环境文件初始化
```

## 验证

```bash
pnpm check
pnpm test
pnpm build:api
pnpm mobile:export
```

真实数据库集成测试单独运行，需要专用测试库，详见开发说明。`mobile:export` 检查 Android / iOS JavaScript 打包，不等于已生成或安装原生 App。

## 文档

- [架构与目录约定](docs/architecture.md)
- [业务约束](docs/product-spec.md)
- [原型操作与功能设计](docs/prototype-guide.md)
- [环境、启动、数据库与部署](docs/development.md)
- [本次工程验收记录](docs/engineering-status.md)

下一阶段：表结构与迁移、登录会话、创建账本，跑通真实账号的第一条业务链。
