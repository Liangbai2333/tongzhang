# 同账 TongZhang

多人共享记账与结算移动端 App。React Native / Expo + Fastify + PostgreSQL，全栈 TypeScript。

当前包含模块工程骨架：30项接口契约与路由、14张业务/支撑表及迁移、前后端模块边界、分摊与结算算法、移动端API与面板状态模型。默认启动欢迎与登录流程，已接通移动端注册、登录、在线会话恢复和退出；登录后展示真实账号资料。账号注册/登录/刷新/退出与 `getMe` 已接通，采用 15 分钟 JWT Access Token + 最长 30 天 Refresh Token，支持刷新轮换和退出即时撤销；其余业务 Service 占位接口返回501；应用图标和启动图暂用Expo模板资源。

## 快速开始

环境：Node.js 24、pnpm 12.6.0、Docker Desktop。安装与环境变量设置见[成员环境配置](docs/environment-setup.md)，Windows 成员从其中的 [Windows 步骤](docs/environment-setup.md#windows)开始。下面以 macOS 的 iOS 开发为例，iOS 模拟器还需 Xcode 和 CocoaPods。

```bash
pnpm install --frozen-lockfile
pnpm setup       # Docker Desktop 需已启动
pnpm build:ios   # 首次或原生依赖/配置变化后
pnpm dev:ios
```

日常先按需执行 `pnpm up:db`，再执行 `pnpm dev:ios`（或 `dev:android`）。`dev` 只检查数据库、编译并启动 API、共享包监听与 Metro，不执行迁移或原生安装；Ctrl+C 停止本次进程，保留数据库。拉到新迁移后执行 `pnpm migrate:db`。Android 首次使用 `pnpm build:android`。

Android、指定模拟器、配置真机 IP 等步骤见 [开发说明](docs/development.md)。

API 默认 `http://localhost:3300`：

- `/health/live`：进程存活，不依赖数据库。
- `/health/ready`：真实 PostgreSQL 连接检查，失败返回 503。
- `/api/v1/system/info`：项目基础约定，验证两端共享接口。
- `/docs`：开发环境 Swagger UI。

## 目录

```text
apps/mobile         Expo Router、认证页面、业务 feature、主题与请求封装
apps/server         Fastify 服务端：http 适配、db 基础、业务模块、迁移与测试
packages/contracts  Zod 请求/响应 Schema 与接口登记表
packages/domain     整数金额、分摊纯函数与业务上限
docs                架构、业务、原型、开发说明
infra               PostgreSQL、服务端容器、Caddy
scripts             环境初始化、开发进程编排与容器验证
```

## 验证

```bash
pnpm check
pnpm check:env --tools-only
pnpm test
pnpm test:mobile
pnpm build:server
pnpm export:mobile
```

真实数据库集成测试单独运行，需要专用测试库，详见开发说明。`export:mobile` 检查 Android / iOS JavaScript 打包，不等于已生成或安装原生 App。

## 配置与部署

- 本机 API 和开发 Compose 共用 `apps/server/.env` 的 `PG*` 参数；移动端公开配置位于 `apps/mobile/.env`。
- 生产只维护服务器上的 `infra/.env`，由 Compose 分别注入 PostgreSQL、API 和 Caddy。API 不读取生产环境文件，也不在启动时迁移。
- 普通 CI 负责检查和测试；手动运行 **Publish server image** 发布已验证镜像，在服务器执行 `bash infra/deploy.sh` 完成备份、迁移与健康验收。
- 变量清单、发布和恢复步骤见 [开发与部署说明](docs/development.md)。目前未部署真实生产环境。

## 文档

- [模块架构、职责与开发入口](docs/modules/README.md)
- [移动端认证实现与验证](docs/mobile-auth-validation.md)
- [关于、协议与隐私面板验证](docs/legal-panels-validation.md)
- [双令牌认证变更与验证](docs/auth-token-validation.md)
- [登录、权限与幂等回归](docs/auth-regression-validation.md)
- [公共反馈组件与登录复测](docs/common-feedback-validation.md)
- [成员环境、启动与 CI 支持](docs/environment-validation-2026-10-24.md)
- [模块骨架验证记录](docs/module-skeleton-validation.md)
- [架构与目录约定](docs/architecture.md)
- [业务约束](docs/product-spec.md)
- [原型操作与功能设计](docs/prototype-guide.md)
- [原型设计目标与原则](docs/prototype-design-principles.md)
- [环境、启动、数据库与部署](docs/development.md)
- [macOS、Linux 与 Windows 成员环境配置](docs/environment-setup.md)
- [本次工程验收记录](docs/engineering-status.md)

账号页面与真实接口已接通；后续完成创建/加入账本、消费分摊、结算与归档。详见模块架构文档。
