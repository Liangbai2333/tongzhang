# Issue #19：建账、加入原生联调与 CI 验证

2026-10-25，负责人高娅婷（@embed-routine）。本记录对应 [Issue #19](https://github.com/Liangbai2333/tongzhang/issues/19) 的当日交付，不代表 T17 整项完成，也不扣减整项剩余点数。

## 版本与结论

以远程 `main` 的 `3cb6e0bc7e5167d991b8454b1fce084739077b41` 验证。服务端建账/邀请 [PR #21](https://github.com/Liangbai2333/tongzhang/pull/21)、测试 [PR #24](https://github.com/Liangbai2333/tongzhang/pull/24)、移动端 [PR #25](https://github.com/Liangbai2333/tongzhang/pull/25) 均已合入。甲通过原生 App 建账，乙通过邀请码预览并确认加入，双方读取同一账本、成员和角色；无效码、过期码、已是成员、冷启动恢复及创建者重置均有本轮证据。

任务开始时 `main` 尚为 `a9aba79`，移动端页面缺失；确认 #25 合入后将本任务分支快进到 `3cb6e0b` 才开始下述 App 验证。没有把未合入的候选分支当成主线。原工作区未跟踪的冲刺文档及原有 3300/3313、8081/8083 进程均未修改。

## 环境与实际命令

| 项目             | 本轮实际值                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| 主机             | macOS 27.0.1（26A434），arm64                                                                                     |
| Node / pnpm      | 24.22.0 / 12.6.0；仓库 Node 固定 24.21.0，环境检查明确给出 patch 差异警告                                         |
| Docker / Compose | 29.8.2 / 5.5.1；复用已运行且 healthy 的 `tongzhang-dev-postgres-1`，本轮未重建共享容器                            |
| 数据库           | PostgreSQL 17.11，127.0.0.1:35432；新建 `tongzhang_issue19_test` 供 App，`tongzhang_issue19_ci_test` 仅供集成测试 |
| API / Metro      | `http://127.0.0.1:3319` / `http://127.0.0.1:8084`；均来自本 worktree                                              |
| 原生客户端       | 已安装 SDK 57 开发客户端，App 0.1.0，`com.tongzhang.app`；iPhone 18 Pro / iOS 27.0 模拟器                         |
| Xcode            | 27.0（27A266a），Device Hub 显示原生设备窗口                                                                      |
| 范围             | 单台模拟器先后登录两个账号；未执行 Android 原生安装、物理真机或其他成员电脑验收                                   |

实际执行的主要命令（从本 worktree 根目录运行）：

```bash
# SSH 拉取被关闭后，用一次性 HTTPS URL 获取同一个 origin/main；不改 remote 配置。
git -c remote.origin.url=https://github.com/Liangbai2333/tongzhang.git fetch origin main
git merge --ff-only origin/main
pnpm install --frozen-lockfile
pnpm migrate:db
pnpm build:server
HOST=127.0.0.1 node apps/server/dist/server.js
# 另一终端，apps/mobile/.env 指向本轮 API：
pnpm --filter @tongzhang/mobile dev --port 8084
pnpm check:env --ios --json
curl -fsS http://127.0.0.1:3319/health/live
curl -fsS http://127.0.0.1:3319/health/ready
xcrun simctl openurl booted 'tongzhang://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8084'
```

本地 `.env` 从既有未提交配置准备，API 的 PGHOST/PGPORT/PGUSER/PGPASSWORD 沿用同一个本地 PostgreSQL，PGDATABASE 指向本轮隔离库，PORT=3319；移动端配置 `APP_VARIANT=development`、`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3319`。两个隔离库用 PostgreSQL 管理连接显式创建，再对 App 库运行迁移。不要在已有数据卷上修改 Compose 的 POSTGRES_DB 并期待它自动新建数据库，也不要删除共享卷。

原生操作期间，API 以临时 runner 调用本 worktree 编译的 `buildApp`，仅增加 `onSend` 日志 hook，记录时间、路径、状态、requestId 及非认证响应；不记录密码、令牌、Authorization 或幂等键，不替换响应、不注入会话、不延迟业务。操作结束后恢复上面的标准 API 启动方式。凭据、runner、构建目录和 `.env` 均未提交。

[环境检查原始输出](evidence/issue19/environment.json)确认 `SELECT 1 succeeded` 和 API 真实数据库连接；[迁移输出](evidence/issue19/migrate.log)成功。健康检查真实响应如下，另见[原始请求记录](evidence/issue19/native-requests.json)：

```json
{"data":{"status":"ok","service":"tongzhang-server"}}
{"data":{"status":"ok","database":"connected"}}
```

没有新增或修改原生依赖、配置、路由及业务代码；本轮复用已安装开发客户端，不声称执行了新的 `build:ios` 或重新安装。双端 JS 导出与原生 App 操作分别记录。依赖/原生配置变化时仍须先按工程约定执行 `pnpm build:ios` 或 `pnpm build:android`。

## 本轮原生操作与证据

通过真实注册 HTTP 接口准备「验收甲19」「验收乙19」两个隔离账号，然后在 App 以密码正常登录；注册不是本轮 App 界面操作。账号邮箱采用 `example.test`，密码与令牌仅保留在本机临时文件。账本 ID 为 `976c298a-668b-4449-860b-cda727273726`，名称 `Issue19-20 Native`，预设封面 `city`。

| 步骤 | App 实操及实际结果                                                                                                                            | 本轮截图                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | 甲登录后为空列表，通过右上角 + → 创建新账本，填写名称并选择城市封面。POST 201；邀请页显示 `ATTJK6`、1/12 人                                   | [建账后的邀请](evidence/issue19/01-created-invitation.png) |
| 2    | 甲正常退出，乙登录为空列表。+ → 有邀请码？加入账本，输入不存在但格式合法的 `ZZZZZZ` → 查看账本，400 `INVITE_INVALID`，原输入保留              | [无效码](evidence/issue19/02-invalid-code.png)             |
| 3    | 只将该测试邀请的 created_at/expires_at 临时调整为 8 天前/1 天前，保留数据库时间约束；乙输入真实码，409 `INVITE_EXPIRED`。随后恢复两个原始时间 | [过期码](evidence/issue19/03-expired-code.png)             |
| 4    | 再次查看有效邀请，预览显示甲、1/12 人；仅发生 POST preview，没有加入写入                                                                      | [加入前预览](evidence/issue19/04-preview-one-member.png)   |
| 5    | 乙确认加入，POST join 200；打开成员面板为 2/12，甲为创建者、乙为成员；乙无邀请/重置管理入口                                                   | [乙端成员](evidence/issue19/05-b-members.png)              |
| 6    | 乙回到列表，再输入同一码并查看，提示已是成员；点击进入账本，没有第二个 join POST                                                              | [已是成员](evidence/issue19/06-already-member.png)         |
| 7    | 终止并重开开发客户端；真实 refresh、getMe 和列表均 200，乙看到同一账本                                                                        | [乙冷启动](evidence/issue19/07-b-cold-start.png)           |
| 8    | 乙退出，甲重新登录，打开同一账本成员面板，双方和角色一致；只有甲有邀请与重置入口                                                              | [甲端成员](evidence/issue19/08-a-members.png)              |
| 9    | 甲在成员面板选择重置并确认，POST reset 200；新码 `F2KNYV`、2/12 人，版本仍为 2，旧码失效                                                      | [重置后的邀请](evidence/issue19/09-reset-invitation.png)   |

第 3 步最初只修改 expires_at，数据库正确拒绝 `expires_at <= created_at`（23514），未留下修改；随后同时设置有效的测试时间对，成功复现过期并恢复。没有放宽约束或修改系统时钟。第 8 步一次自动化输入只录入账号前缀 `issue19-`，真实登录返回 401；核对并补入完整邮箱后成功。这与业务会话恢复失败不同；本轮没有宣称修复历史报告中的认证异常。首次切换到隔离 API 时，原库会话无效并要求重新登录也符合隔离库预期。

上述为原生客户端截图，非 Web 或组件渲染图；[截图尺寸与 SHA-256](evidence/issue19/screenshots.json)用于核对。`08-a-members.png` 在重置后补拍以避开系统保存密码提示；重置前后成员与账本版本不变。未触发系统分享，也未把扫码按钮标为可用（当前明确暂未开放）。

## HTTP、数据库与自动验证

原生请求记录截至成员复核结束：成功创建一次、成功加入一次、成功重置一次；另有 preview 和只读查询。随后单独执行 [19 项真实 HTTP 核对及 SQL 结果](evidence/issue19/http-database.json)，不计入原生请求次数：

- 甲乙列表、详情、成员均为 200，成员响应一致；普通成员读取/重置邀请均 403，缺少会话为 401。
- 缺失幂等键、无效游标、非法格式码为 400；自定义封面仍 501；旧邀请被重置后为 400 `INVITE_INVALID`。
- 复用原生建账成功的原键和原内容返回首次 201 快照及同一账本 ID；改内容则 409 `IDEMPOTENCY_CONFLICT`。重放不是实时详情，需另读 A07。
- 额外 HTTP 重复加入返回 `alreadyMember:true`。SQL 确认仅一账本、两成员、版本 2、当前有效邀请一条、消费零条；重置不改变成员/版本。保留 App 测试数据供后续核对，未删除既有开发数据。

| 命令                                                    | 本轮实际结果                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm check`                                            | 构建、类型、Lint、全仓格式通过。[日志](evidence/issue19/check.log)                      |
| `pnpm test`                                             | 18 文件 / 112 项，无数据库。[日志](evidence/issue19/unit-tests.log)                     |
| `pnpm test:mobile`                                      | iOS + Android 组件测试，18 suites / 154 项。[日志](evidence/issue19/mobile-tests.log)   |
| 显式设置 `TEST_DATABASE_URL` 后 `pnpm test:integration` | 11 文件 / 96 项，真实隔离 PostgreSQL 库。[结果](evidence/issue19/integration-tests.log) |
| `pnpm build:server`                                     | 通过，当前 worktree 编译产物用于 API                                                    |
| `pnpm export:mobile`                                    | Android/iOS JavaScript 导出通过，非原生安装。[日志](evidence/issue19/mobile-export.log) |
| `pnpm doctor:mobile`                                    | 21/21。[日志](evidence/issue19/expo-doctor.log)                                         |

## CI 核对与交付边界

已通过 GitHub 实际查询核对 [PR #25 的 Checks run 75](https://github.com/Liangbai2333/tongzhang/actions/runs/40201783953)，head 为本轮相同的 `3cb6e0b`。`check`、`container` 均 completed/success；前者包括检查、无数据库/移动端/数据库测试、迁移、构建、依赖校验、Expo Doctor、双端导出，后者包括 Compose 校验、镜像构建及容器测试。[任务与逐步状态快照](evidence/issue19/ci-pr25.json)。另外 [PR #24 run 72](https://github.com/Liangbai2333/tongzhang/actions/runs/40201066277) 在 `a9aba79` 为 success，仅作为测试增量的历史 CI，不替代 #25 或本次新 PR 的检查。

本轮未遇到需要修复的 CI 失败；旧版本已有故障及处理见[此前环境记录](environment-validation-2026-10-24.md)。本次文档 PR 的 CI 在创建后按自身最终 head 另外核对，不能将 #25 的绿色结果当成本 PR 的绿色结果。

本轮完成 #19 的当日环境/联调要求；没有重做 #7 已交付的环境工具、没有把全部 T17 标为完成。Windows、Android 原生安装、物理设备、其他成员机器与完整业务候选版仍是后续范围。审核与合并遵守 CONTRIBUTING，不在本轮自动合并或提前改动燃尽图。
