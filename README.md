# 同账 TongZhang

多人共享记账与结算移动端 App。React Native / Expo + Fastify + PostgreSQL，全栈 TypeScript。

当前可在真实 API / PostgreSQL 上完成注册登录、在线会话核验、自定义封面建账、邀请码加入、消费与收据、余额和结算预览、正式冻结、整笔已还登记、创建者结清、个人归档与历史只读查看。当前文档基于 `7616adb`（2026-10-27，含 #48 候选验收）；#49 已用两个真实账号在 Android 模拟器重新走完这条 App 路径，见[逐项实操与版本证据](docs/issue49-documentation-validation.md)。

消费修改/删除、统计、资料修改、通知偏好保存仍为 501，扫码未开放。已还只是人工登记，不改变消费；个人归档只影响本人。发布签名包、物理真机、iOS 当前完整主链及生产部署未在本轮验收。完整边界见[已知限制](docs/known-limitations.md)。

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

## 当前操作与接口

- [完整 App 操作手册](docs/app-user-guide.md)：安装登录、双账号完整路径、图片权限与显式恢复。
- [30 项接口索引](docs/api-reference.md)：请求/响应字段、权限、整数分字符串、成员 ID、幂等与版本冲突。
- [已知限制](docs/known-limitations.md)与 [#49 逐项验收](docs/issue49-documentation-validation.md)：新截图、实际版本、检查和遗留项。

## 历史验收与设计资料

下列记录保留各自日期、源码与原生包归属，不是当前版本验收的统一声明；当前使用入口以上方手册/索引为准。

- [模块架构、职责与开发入口](docs/modules/README.md)
- [移动端认证实现与验证](docs/mobile-auth-validation.md)
- [Figma 账本界面第一轮对齐](docs/figma-ledgers-alignment.md)
- [Figma 邀请、加入与成员面板对齐](docs/figma-invitations-alignment.md)
- [移动端消费、收据与余额预览验证](docs/mobile-expenses-validation.md)
- [Issue #17 建账、多人加入与异常反馈验收](docs/issue17-app-acceptance.md)
- [关于、协议与隐私面板验证](docs/legal-panels-validation.md)
- [封面事务绑定、临时图片清理与 T09/T22 复核](docs/cover-cleanup-validation.md)
- [消费查询、图片与收据绑定阶段验证](docs/expense-images-validation.md)
- [正式结算与账本冻结验证](docs/settlement-freeze-validation.md)
- [正式结算进度、已还登记与结清验证](docs/settlement-progress-validation.md)
- [移动端正式结算确认、记录与原生验证（#27）](docs/mobile-settlement-validation.md)
- [Issue #42 已还、结清、归档与自定义封面完整原生验收](docs/issue42-mobile-completion-validation.md)
- [Issue #43–#45 归档、图片与结算联合验收](docs/issues43-45-integration-validation.md)
- [双令牌认证变更与验证](docs/auth-token-validation.md)
- [登录、权限与幂等回归](docs/auth-regression-validation.md)
- [Issue #18 建账、邀请码与加入自动化测试](docs/issue18-ledger-invitation-tests.md)
- [Issue #32 主线覆盖核对与清理竞争回归](docs/issue32-regression-validation.md)
- [Issue #19 建账、加入原生联调与 CI](docs/issue19-native-environment-validation.md)
- [Issue #33 Android 原生安装、图片权限与真实联调](docs/issue33-android-native-validation.md)
- [Issue #48 固定候选、Android 双账号闭环与在线认证门禁](docs/issue48-native-candidate-validation.md)
- [建账与邀请接口索引、双账号操作说明（#20）](docs/ledger-invitation-api-guide.md)
- [消费、收据与正式冻结原生验收（#31）](docs/issue31-native-acceptance.md)
- [消费、图片、正式结算与个人归档操作说明（#34）](docs/expense-settlement-api-guide.md)
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
