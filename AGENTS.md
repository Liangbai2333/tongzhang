# 同账工程约定

## 范围

- 阅读 README、docs/product-spec.md 和相关模块后修改。完整目标见 docs/architecture.md。
- 这是移动端项目，不新增 Web 页面或 Web 构建。
- 当前仅工程骨架，不用假登录、假账本或模拟余额冒充业务实现。
- 路由位于 apps/mobile/app；页面实现位于 src/features，面板和错误状态不单独建全屏路由。

## 协作

- 开始任务前阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，遵守其中的 Issue、提交、PR 和验收流程。
- 新任务分支按改动类型使用 `feat/`、`fix/`、`test/`、`docs/`、`chore/`、`ci/` 前缀，不使用 `codex/`；已有分支不擅自重命名。
- PR 不使用固定模板，简要说明关联任务、修改内容和实际验证结果；界面改动附截图，不新增 PR 固定模板。
- 成员通过 PR 提交，由系统架构负责人审核并以 Rebase and merge 合并，保持线性历史；未经用户明确要求，不提交、推送、合并或改写共享历史。
- 只处理本次任务相关修改，保留他人未提交工作，不擅自更改作者、提交者或时间。
- 部分完成用 `Refs #编号`，完整解决才用 `Closes #编号`；任务验收通过后再更新完成状态和剩余点数。

## 边界

- apps/mobile 和 apps/server 只通过 packages/contracts、packages/domain 共享代码。
- 共享包不可依赖 Node 专有 API、React Native、Fastify 或数据库；移动端不导入服务端代码。
- 金额用 bigint 整数分计算，API 用整数字符串，禁止浮点金额计算。
- 最多 12 人；精确最少笔数算法放服务端。分摊保存时由服务端重新校验。
- 所有业务操作在线，不持久化业务缓存，不建立离线队列，不自动重试写操作。
- 生命周期 ACTIVE → SETTLING → SETTLED；预览不冻结；还款不是消费；个人归档不改财务状态。
- 图片独立 bytea 表，业务仅保存引用，读取也检查成员权限。
- 数据库事务由 service 管理，跨 Repository 共用 tx；写接口实现幂等与权限校验。

## 工程

- pnpm 工作区统一锁文件，使用 workspace:* 引用本地包，不另生成 npm/yarn 锁文件。
- 脚本命名采用“动作:对象”（如 build:ios、migrate:db）；组合入口及包内对象明确的命令可保留简短名称。按初始化、开发、构建与导出、数据库、检查与格式化、测试排列，修改命令时同步更新调用方、CI 和文档。
- 原生依赖在 apps/mobile 使用 pnpm exec expo install；不要独立升级 React / React Native。
- 当前为 Expo SDK 57，涉及 Expo / React Native API 时查阅 https://docs.expo.dev/versions/v57.0.0/，不凭旧版本记忆编写。
- 业务表定义放 apps/server/src/db/schema，迁移放 apps/server/drizzle。审查并提交生成的 SQL，不对共享环境使用 schema push。
- 凭据只在未提交的 .env 或部署环境中；EXPO_PUBLIC_ 变量不得包含密钥。
- 本机 API 与开发 Compose 共用 apps/server/.env 的 PG* 参数；生产仅由 Compose 注入变量，禁止加载本地 .env。生产镜像由发布流程构建，服务器不编译源码。
- setup 负责初始化；dev 只检查数据库、编译并启动开发进程；原生构建与迁移独立执行，不在 API 启动时迁移。
- 不手工编辑生成的 ios、android 目录，使用 Expo config plugin。

## 验证

- 修改代码后运行 pnpm check；业务或基础设施逻辑变更运行相应测试。
- pnpm test 为无数据库测试；集成测试显式设置 TEST_DATABASE_URL 后运行 pnpm test:integration。
- 修改共享包/原生依赖/路由后运行 pnpm export:mobile 和 Expo Doctor；依赖变更另运行 expo install --check。
- 新增原生依赖或修改原生配置后需重建开发客户端（pnpm build:ios 或 pnpm build:android，包含 Prebuild）。
- 不将 JS 打包通过描述为真机验收通过；区分模拟接口、实际数据库及原生安装验证。
