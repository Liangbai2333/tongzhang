# Issue #48：固定候选源码与 Android 原生闭环

2026-10-27，关联 [Issue #48](https://github.com/Liangbai2333/tongzhang/issues/48)。本轮技术验收通过，提交独立 PR 待系统架构负责人审核；不合并、不发布、不创建标签、不部署生产、不提前核销 T17 整项 8 点。使用仓库已配置的 Liangbai2333 身份，不冒用 Issue 原负责人。

## 审查、候选与证据复用

已阅读 AGENTS、CONTRIBUTING、README、product-spec、architecture 和相关认证、图片、账本、结算模块。先 fetch/pull --ff-only，同步远程 main `af03672fb929caa26db1b407039a436e9cbf4e4e`，再创建独立 worktree `/Users/liangbai/.codex/worktrees/issue48-native-acceptance/tongzhang`、分支 `test/48-native-acceptance`。原工作区未跟踪的冲刺文档完整保留。

用户所称 PR #33 在仓库中实际是 **Issue #33**，对应 [PR #41](https://github.com/Liangbai2333/tongzhang/pull/41)；直接查询 pull/33 为 404，已核对 Issue 评论和实际 PR，不虚构 PR。另审查 [PR #50](https://github.com/Liangbai2333/tongzhang/pull/50)、其复核记录及最新 [#46/#47 验收](issues46-47-acceptance.md)。#50 无讨论评论；#33 评论中的旧包与 #50 重建后的包不是同一个包。

| 既有证据                                                                                                                                                           | 本轮处理                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [#33 原生安装和图片阶段](issue33-android-native-validation.md)、[PR #41](https://github.com/Liangbai2333/tongzhang/pull/41)                                        | 复用构建流程、系统活动恢复与加入崩溃修复的来历；其 APK 哈希不冒充本轮包                                                             |
| [#42 双账号完整流程](issue42-mobile-completion-validation.md)、[#50 修复复核](pr50-review-validation.md)、[#43–45 联合验收](issues43-45-integration-validation.md) | 复用权限/幂等、未知写结果、零转账等仍适用的证据；本轮在新主线和新库重做双账号主链                                                   |
| [#46/#47](issues46-47-acceptance.md)                                                                                                                               | 已包含本轮基线；复用小屏、未知写跨断网保留和组合集成测试的结论。本轮重点补验原生系统取消/拒权、在线门禁、冷启动、真实撤销和迟到响应 |

**业务源码候选始终为 `af03672`，未发现需修改产品源码的新缺陷。** 本 PR 仅新增本报告、诊断/复现工具与证据；最终交付 SHA 和该 SHA 的 CI 链接记录在 PR 描述中。不可将此前 #50 或 #46/#47 的绿灯当成本 PR 的 CI。

## 原生客户端与实际加载源码

| 项目        | 实际值                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主机/工具   | macOS arm64；Node 24.22.0、pnpm 12.6.0。环境检查明确警告仓库 Node 固定为 24.21.0，未静默修改版本约定                                                                                                                                                                     |
| App/SDK     | `com.tongzhang.app`，0.1.0/versionCode 1；Expo 57.0.31、React Native 0.86.3、React 19.2.3、dev-client 57.0.20、image-picker 57.0.20                                                                                                                                      |
| Android     | `emulator-5554` / `Medium_Phone_API_37.0`，Android 17/API 37、arm64-v8a，1080×2400、density 420；minSdk 24/targetSdk 36。非物理真机                                                                                                                                      |
| APK 来源    | 复用 #50 最终原生源码 `209727140390a519c59f9ee287b8e7cd3e3472e7` 执行 Prebuild/编译/安装的开发客户端，详见 [原构建记录](evidence/issue42/native-final.json)；本轮**没有新构建或重装**                                                                                    |
| 实装 APK    | 通过 `pm path` 定位，再 `adb pull` 当前设备 base.apk；99,547,334 字节，SHA-256 `72504440573ae6985ad362bbd53854b03b46ac4d5a97c17513b0b53a61bbecf0`，与 #50 和 #46/#47 一致                                                                                                |
| 兼容性依据  | `git diff 2097271 af03672 -- apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.config.ts apps/mobile/plugins apps/mobile/assets` 为空；开发 variant 相同。原生依赖、配置、显式网络重试插件与资源完全一致，故允许复用；若任一改变应重新 `pnpm build:android` 并安装 |
| 原生配置    | `apps/mobile/app.config.ts`，APP_VARIANT=development，允许开发 HTTP；`with-explicit-network-retries.cjs` 关闭底层连接自动重发和重定向、禁用空闲连接复用；未手改生成目录                                                                                                  |
| 实际 JS     | 新 worktree Metro `8048`，清缓存后冷启动。直接从 App 沙盒读取 `files/DevLauncherApp-BridgelessReactNativeDevBundle.js`，10,060,474 字节，SHA-256 `65483112834e4d0c4d6bc3c1f0cf169b2405d0ce43930e0ffe285a39c646`；前后两次读取相同                                        |
| JS 归属核对 | 包内实际 API 为 `http://127.0.0.1:3348`，项目根为新 worktree；sourceURL 指向 8048。相同 URL 的 source map 有 102 份项目源码与候选磁盘内容逐字节匹配，0 不匹配；[明细](evidence/issue48/loaded-js.json)                                                                   |
| API/数据库  | 候选 `pnpm build:server` 的真实 Fastify/service/repository，127.0.0.1:3348；独立 postgres:17-alpine 容器 `tongzhang-48-postgres`，127.0.0.1:51653，原生库 `tongzhang_48_native`，测试库 `tongzhang_48_test`，均用已提交迁移。设备通过 adb reverse 连接 API/Metro         |

[环境与配置哈希](evidence/issue48/environment.json)、[完整证据哈希与采集时间](evidence/issue48/manifest.json)。口令、JWT 密钥、测试账号密码和令牌仅在本机权限 0600 的 `/tmp/tz48-*` 私有文件，不提交。服务端没有生产连接；未改既有开发数据库、未删除其卷。

## 真实双账号 App 闭环

三账号仅通过真实注册接口准备，图片沿用模拟器中标为 TEST DATA ONLY 的测试素材；账号准备不是原生注册验收。甲 owner、乙 member 均在渲染的 App 登录输入框正常输入邮箱/密码；未注入会话。**下表所有成功业务写入均由 App 操作**，HTTP 补充检查只登录/读取/验证拒绝；SQL 仅只读快照和下节明确标注的会话撤销夹具。

主账本 `9c39754f-647d-46e9-b68f-1e3c90c483b5`；批次 `fe80d1d9-52a0-47fb-a4e7-731ea9ac405b`。

| 顺序/操作              | 预期与实际                                                                                                      | 本轮原生截图                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 甲登录、相册封面建账   | 从空列表创建 `Issue48-Native-Candidate`，COVER 上传 1 次、创建 201，ACTIVE/version 1、1 人；真实邀请码 `3JTHPZ` | [空列表](evidence/issue48/01-owner-empty.png)、[封面](evidence/issue48/04-cover-selected.png)、[创建成功](evidence/issue48/12-created-invitation.png)                                                                                                                               |
| 乙密码登录、预览并加入 | App 确认甲创建的同一账本，join 200，2 人/version 2；非 API 夹具加入                                             | [预览](evidence/issue48/13-member-join-preview.png)、[加入](evidence/issue48/14-member-joined.png)                                                                                                                                                                                  |
| 乙保存收据消费         | 乙付款且记录，12000 分，两人各 6000；RECEIPT 真实上传 1 次并绑定，ACTIVE/version 3                              | [消费与分摊](evidence/issue48/20-member-expense-splits.png)、[乙收据](evidence/issue48/21-member-receipt.png)、[甲授权读取同一收据](evidence/issue48/23-owner-authorized-receipt.png)                                                                                               |
| 乙只读预览，甲正式冻结 | 乙无冻结入口；甲预览一笔甲→乙 6000 分，版本 3；确认后 SETTLING/version 4，仅一批次；预览阶段 SQL 无批次         | [乙预览](evidence/issue48/22-member-preview-no-freeze.png)、[甲预览](evidence/issue48/24-owner-preview.png)、[版本确认](evidence/issue48/25-freeze-version3.png)、[待登记且结清禁用](evidence/issue48/26-frozen-pending.png)                                                        |
| 甲作为付款人登记已还   | 整笔 6000 分，备注 `Issue48-6000`；1/1 已登记、剩余 0，仍 SETTLING；这只是人工登记，没有真实支付验收            | [登记](evidence/issue48/27-register-6000.png)、[登记后](evidence/issue48/28-paid-zero-remaining.png)                                                                                                                                                                                |
| 甲创建者确认结清       | SETTLED/version 5，总消费仍 12000，转账仍 6000，批次不变                                                        | [已结清](evidence/issue48/29-settled.png)                                                                                                                                                                                                                                           |
| 甲个人归档与历史       | 仅甲 archivedAt 非空；当前列表移出、在线历史可读详情/消费/正式批次，历史只读                                    | [确认](evidence/issue48/30-personal-archive-confirm.png)、[当前空列表](evidence/issue48/31-owner-current-empty.png)、[历史](evidence/issue48/32-owner-history.png)、[只读详情](evidence/issue48/33-owner-history-detail.png)、[同批次](evidence/issue48/34-owner-history-batch.png) |
| 乙再次 App 读取        | 同账本仍在乙当前列表，已结清且 0 净额；乙历史为空；正式批次、金额、登记人/时间/说明相同                         | [乙当前列表](evidence/issue48/42-member-current-unarchived.png)、[乙同一批次](evidence/issue48/43-member-same-settled-batch.png)、[乙历史空态](evidence/issue48/44-member-history-empty.png)                                                                                        |

## 系统活动、网络与认证门禁

截图均是当前 Android 模拟器的 `adb exec-out screencap -p` 原始像素，保留系统栏和 Expo 工具浮层；没有使用 Web、设计稿或历史截图代替。本次未改变界面设计。

| 用例/具体操作               | 预期与实际                                                                                                                                                                                                              | 证据                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 建账相册取消                | 填名称→打开真实系统相册→系统返回取消；名称与预设保留，未上传/创建                                                                                                                                                       | [系统相册](evidence/issue48/02-system-cover-picker.png)、[取消后](evidence/issue48/03-cover-cancel-keeps-name.png)                                                                                                                                                                                                                                |
| 收据取消与拒权              | 填 ¥120/名称→点拍摄→系统选 Don’t allow；保留表单并提示拒权。随后相册选入 43 KiB 收据→取消重选→再拍摄并再次系统拒权；原选择/分摊保留，无上传或保存请求，直到手动点保存                                                   | [系统权限](evidence/issue48/15-camera-system-permission.png)、[首次拒权](evidence/issue48/16-denied-keeps-expense.png)、[重选系统相册](evidence/issue48/17-receipt-reselect-system.png)、[取消保留收据](evidence/issue48/18-cancel-keeps-selected-receipt.png)、[再次拒权保留收据](evidence/issue48/19-denied-keeps-selected-receipt.png)         |
| 前后台恢复门禁              | 已填建账名/选封面→Home→返回；诊断 hook 仅延迟真实 getMe 200 响应 8 秒。期间实际点击底层创建位置及 Android 返回键，只有核验界面可见、未发送创建；成功后原表单恢复                                                        | [核验中](evidence/issue48/05-foreground-verification-gate.png)、[恢复原表单](evidence/issue48/06-foreground-form-retained.png)                                                                                                                                                                                                                    |
| 真实断网与迟到 200          | 再次延迟 getMe→实际 `svc wifi disable`、`svc data disable`→后台/前台切换，旧请求合并但不可放行；8 秒后真实 200 到达仍锁定。手动核验显示“网络未连接”。重新启用网络不自动放行；显式核验成功才返回原名称和封面，再手动创建 | [等待](evidence/issue48/07-offline-pending-response-gate.png)、[迟到后仍锁](evidence/issue48/08-late-200-stays-locked.png)、[断网手动核验](evidence/issue48/09-offline-explicit-verification.png)、[联网未放行](evidence/issue48/10-online-still-needs-verification.png)、[核验后恢复](evidence/issue48/11-online-verification-restores-form.png) |
| 断网冷启动                  | 已登录后关闭 Wi-Fi/移动数据→force-stop→从 8048 启动；没有展示历史缓存，提示网络未连接；重新联网本身不放行。显式核验时真实 refresh 延迟 8 秒，仍仅有门禁；refresh 200→getMe 200 后才展示真实列表                         | [设备网络状态](evidence/issue48/cold-offline-device.json)、[冷启动断网](evidence/issue48/35-cold-offline-gate.png)、[联网仍门禁](evidence/issue48/36-cold-online-not-auto-unlocked.png)、[刷新期间](evidence/issue48/37-cold-refresh-verification-gate.png)、[成功后](evidence/issue48/38-cold-verified-list.png)                                 |
| 真实撤销/401 丢弃受保护表单 | 甲另开未提交 `Blocked48-Revoked` 建账表单→Home→SQL 只撤销本夹具甲的会话→前台；真实 getMe 401，身份/受保护页面移除，显示失效提示。受保护 deep link 不能继续建账；全库仍只有主账本                                        | [撤销前表单](evidence/issue48/39-form-before-real-revocation.png)、[撤销 SQL](evidence/issue48/db-revoke.json)、[真实失效](evidence/issue48/40-real-401-removes-form.png)、[受保护 deep link 被拒](evidence/issue48/41-protected-deeplink-rejected.png)                                                                                           |
| 撤销后的冷启动              | 乙 force-stop 后 SQL 撤销其夹具会话，重开实际 refresh 401，没有展示此前账本/批次                                                                                                                                        | [撤销 SQL](evidence/issue48/db-revoke-1.json)、[冷启动失效](evidence/issue48/45-cold-revoked-refresh-401.png)                                                                                                                                                                                                                                     |

会话撤销属于**测试夹具干预**，不是 App 的成功业务步骤；401 来自真实认证和数据库，未用 hook 伪造。为了重新出现系统相机对话框，仅重置本 App CAMERA 的 user-set/user-fixed 测试标志，拒绝操作仍在 Android 系统对话框完成。未测试相机成功拍摄。

网络测试确实关闭设备两类联网接口；USB 的 adb reverse 仍保留，因此可在“设备报告离线”后故意让既有真实 200 返回，专门挑战迟到响应门禁。这不是物理无线网络丢包/弱网测试，也没有把 API hook 当作实际断网。只有 GET /me 两次及一次真实 refresh 使用 8 秒 onSend 延迟；没有制造成功响应、改业务 service 或延迟业务写入。请求 ID 可将 held-real-response 和 sentAt 配对，不能当成两次请求。

启动与自动化中间状态未冒充最终通过：一次输入驱动在切换账号时漏输邮箱前缀，真实登录返回 401；等输入框聚焦稳定后正常登录成功。冷启动返回键退出到 Launcher 的试跑不计作联网门禁截图；35–37 是保持 App 前台重跑的实际结果。没有修改认证行为来迁就驱动。

## 请求、SQL 与检查

[App 请求记录](evidence/issue48/app-requests.json)明确区分前 3 条注册夹具与原生操作，包含时间、requestId、状态、脱敏键摘要及非认证响应，不记录凭据。[补充 HTTP 请求](evidence/issue48/http-requests.json)与 [HTTP/SQL 断言](evidence/issue48/native-verification.json)验证两成员详情/消费/批次/当前与历史列表，以及图片成员 200、非成员 403、匿名 401；图片 HTTP SHA-256/长度与 PostgreSQL 独立 bytea 行逐一相同、Cache-Control 为 no-store。

SQL 分阶段保存 [预览](evidence/issue48/db-preview.json)、[冻结](evidence/issue48/db-frozen.json)、[登记](evidence/issue48/db-paid.json)、[归档后](evidence/issue48/db-archived.json)。独立断言原消费/分摊/收据整行不变、正式批次整行不变、登记后转账整行在结清/归档后不变；7 类业务审计各一次。[门禁与全库审计](evidence/issue48/gate-audit.json)进一步断言 3 个延迟窗口无业务 POST、未提交的撤销测试名称没有落库。复现工具整理后独立重跑迁移/API 启动，再用 App 正常登录读取同一历史批次，[截图](evidence/issue48/46-repro-runner-same-batch.png)与[请求](evidence/issue48/runner-smoke-requests.json)另列。2 张图片各只上传一次，1 账本、2 成员、1 消费、2 分摊、1 批次、1 转账。补充 HTTP 不执行这些成功业务写入。

| 实际检查                                              | 结果/日志                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`、`pnpm build:server` | [安装](evidence/issue48/install.txt)、[构建](evidence/issue48/build-server.txt)通过；无锁文件变化                                                             |
| `pnpm check:env --tools-only --skip-docker`           | [检查](evidence/issue48/environment-check.txt)：pnpm 匹配；Node patch 差异为警告                                                                              |
| `pnpm check`                                          | [源码检查](evidence/issue48/check-source.txt)及[最终本 PR 全量检查](evidence/issue48/check-delivery.txt)通过                                                  |
| `pnpm test`                                           | [19 文件 / 120 项通过](evidence/issue48/unit.txt)，无数据库                                                                                                   |
| `pnpm test:mobile`                                    | [24 套件 / 232 项通过](evidence/issue48/mobile.txt)，含 iOS/Android 的 Provider/导航、权限、迟到响应、原键保留回归；原生模块与 API 替身不冒充原生或数据库验证 |
| 显式 TEST_DATABASE_URL 后 `pnpm test:integration`     | [独立测试库 15 文件 / 130 项通过](evidence/issue48/integration.txt)；[13 张业务/会话表残留均为 0](evidence/issue48/test-database-cleanup.json)                |
| `pnpm check:mobile-deps`                              | [依赖匹配 SDK 57](evidence/issue48/dependencies.txt)                                                                                                          |
| `NODE_USE_ENV_PROXY=1 pnpm doctor:mobile`             | [21/21](evidence/issue48/doctor.txt)                                                                                                                          |
| `pnpm export:mobile`                                  | [Android/iOS JS 导出通过](evidence/issue48/export.txt)，无 Web 构建；不等同原生构建或安装                                                                     |
| 候选提交 CI                                           | 以本 PR 描述记录的当前 head SHA、push/PR Actions run 链接及 check/container 结果为准，不复用旧 head 绿灯                                                      |

检查日志原始时间为 America/Los_Angeles，HTTP/SQL 为 UTC；仅统一行尾空白和最终换行。验收原生库保留供复核，自动化测试库已清空，不连接生产。

## 可复现步骤

以下工具位于 [本轮证据目录](evidence/issue48)。从仓库根运行；脚本只适用于本机隔离验收。新一轮使用新容器/私有凭据，不覆盖仍需复核的旧原生库；如已有 `tongzhang-48-postgres` 容器，应先为新一轮改名并保留旧证据。准备脚本不会删除任何容器或卷。

1. 安装锁定依赖、构建候选；`node docs/evidence/issue48/prepare-environment.mjs` 新建专用 postgres:17-alpine、生成随机私有配置。待 `docker exec tongzhang-48-postgres pg_isready -U postgres` 成功，显式 `docker exec tongzhang-48-postgres createdb -U postgres tongzhang_48_native`。分别 `node docs/evidence/issue48/run-with-env.mjs migrate:db` 和 `PGDATABASE=tongzhang_48_native node docs/evidence/issue48/run-with-env.mjs migrate:db`；使用已提交 SQL，不用 schema push。迁移独立于 API 启动执行。
2. `node docs/evidence/issue48/native-api-runner.mjs` 启动真实候选 API；诊断 hook 只记录/延迟响应，不替换业务实现。`APP_VARIANT=development EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3348 pnpm --filter @tongzhang/mobile exec expo start --dev-client --port 8048 --localhost --clear`。
3. `node docs/evidence/issue48/register-fixtures.mjs` 准备三账号，私有密码只写 `/tmp/tz48-accounts.json`。把 TEST DATA ONLY 图片放入模拟器 Pictures 并媒体扫描；App 使用系统相册实际选择。
4. 设置 `ANDROID_HOME`/adb 路径，`adb reverse tcp:3348 tcp:3348`、`adb reverse tcp:8048 tcp:8048`。核对原生配置兼容后复用上表 APK；不兼容则先完整 `pnpm build:android`。`adb shell am force-stop com.tongzhang.app`，再 `adb shell am start -a android.intent.action.VIEW -d 'tongzhang://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8048' com.tongzhang.app`。
5. 按上面两个矩阵在 App 登录并操作；每个成功步骤截图。新账本创建后 `export ISSUE48_LEDGER_ID=<App 创建的实际 ID>`；分别在预览/冻结/登记/归档后运行 `node docs/evidence/issue48/db-evidence.mjs preview`（或 frozen/paid/archived）。新一轮在独立工作区采证，避免覆盖本 PR 文件。
6. 延迟核验前，将 `{"method":"GET","path":"/api/v1/me","delayMs":8000}` 写入 `/tmp/tz48-control.json`；Home/前台触发。冷启动刷新则改成 method POST、path `/api/v1/auth/refresh`。实际断网使用 `adb shell svc wifi disable` 和 `adb shell svc data disable`，恢复用 enable；等待真实迟到响应后仍应被门禁遮挡，必须显式重新核验。业务写入始终手动执行。
7. 未提交表单放后台后，`node docs/evidence/issue48/db-evidence.mjs revoke` 仅撤销甲夹具会话；前台应真实 getMe 401。乙冷启动撤销用 `revoke 1`。检查受保护 deep link `tongzhang://ledgers/create` 无法进入。
8. `node docs/evidence/issue48/verify-fixture.mjs` 仅作补充登录、GET、图片拒绝与只读 SQL 断言。此脚本按本报告样例金额/备注核对，需要先在 App 完成对应步骤及阶段快照；不通过 API 补造成功链。全套测试可用 `node docs/evidence/issue48/run-with-env.mjs test:integration`，显式注入私有 TEST_DATABASE_URL；其余命令见上表。
9. 保存当前设备 APK 与实际 JS：`adb shell pm path com.tongzhang.app` 后 pull 返回路径；`adb exec-out run-as com.tongzhang.app cat files/DevLauncherApp-BridgelessReactNativeDevBundle.js`；计算 SHA-256。所有截图由 `adb exec-out screencap -p` 采集。

已查阅 [Expo SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)，未按旧版本记忆增加原生 API。没有新增业务缓存、离线队列或写入自动重试。测试结束恢复 Wi-Fi/移动数据；物理设备、iOS 原生安装、相机成功拍摄、物理弱网及发布签名包仍不在本次实测范围。iOS 仅组件测试及 JS 导出，不宣称 T17 整项完成。
