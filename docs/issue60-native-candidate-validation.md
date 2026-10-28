# Issue #60：Day6 原生候选兼容性与 Day7 交付准备

2026-10-28，关联 [#60](https://github.com/Liangbai2333/tongzhang/issues/60)。本轮无产品源码修改；使用仓库配置的 Liangbai2333 身份，不冒用原负责人。阶段结果提交 PR 待架构负责人审核，不合并，不修改完成状态或扣减 T17 整项 8 点。

## 固定候选与原生兼容性

已阅读 AGENTS、CONTRIBUTING、README、product-spec、architecture 及认证、图片相关模块。原工作区执行 fetch 和 main 快进核对后，从最新 `origin/main` 创建 worktree `/Users/liangbai/.codex/worktrees/issue60-native-candidate/tongzhang`，分支 `test/60-native-candidate`；原目录未提交的冲刺文档保留。

| 项目        | 本轮实际值                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 源码候选    | `c954ddaca0b234949fc549e088d2d54761030031`；最终文档提交 SHA 和该 head 的 CI 结果见 PR 描述                                                                                                                |
| 主机        | macOS 27.0.1 / arm64；Node 24.22.0、pnpm 12.6.0；环境检查保留 Node 与仓库 24.21.0 的 patch 差异警告                                                                                                        |
| App / SDK   | `com.tongzhang.app`，0.1.0 / versionCode 1；Expo 57.0.31、RN 0.86.3；development variant                                                                                                                   |
| 设备        | `Medium_Phone_API_37.0`，Android 17 / API 37、arm64-v8a 模拟器，1080×2400 / density 420；非物理真机                                                                                                        |
| 实装包      | 通过 `pm path` 后 pull 当前 base.apk，99,547,334 字节，SHA-256 `72504440573ae6985ad362bbd53854b03b46ac4d5a97c17513b0b53a61bbecf0`                                                                          |
| 复用依据    | 对比包来源 `209727140390a519c59f9ee287b8e7cd3e3472e7`，mobile/package.json、pnpm-lock.yaml、app.config.ts、plugins、assets 均无变化；与 #48/#58–59 实装包哈希一致。**本轮未 Prebuild、编译或重新安装**     |
| 实际加载 JS | 从 App 沙盒读取开发 bundle，10,064,573 字节，SHA-256 `2b310f1dec974d24f04abfe9b3858ee709dfca56f9179b32b1b66eac7439dd3d`；与同 URL Metro bundle 完全一致，source map 内 103 份项目源码逐字节匹配新 worktree |
| API / Metro | 本候选 `pnpm build:server` 的真实服务，127.0.0.1:3360；清缓存 Metro 8060，App 通过 adb reverse 访问，无 Web 构建                                                                                           |
| 数据库      | 独立 `tongzhang-60-postgres`，PostgreSQL 17，本机 61885；原生库 `tongzhang_60_native`、集成库 `tongzhang_60_test` 分开，均显式运行已提交迁移                                                               |

[版本清单](evidence/issue60/environment.json)、[实际 JS/source map](evidence/issue60/loaded-js.json)。密码、JWT 密钥、令牌仅在本机 0600 私有夹具，不提交；没有加载共享开发数据库配置。

## 本轮实测与既有证据的边界

`git diff adff4d8 HEAD -- apps packages pnpm-lock.yaml package.json scripts infra .github` 为空。与 #58/#59 双账号闭环候选 `89d0166` 相比仅认证控制器及其测试改变，已由 `adff4d8` 的迟到响应修复和原生证据覆盖。本轮重新核对 103 个源码哈希及旧证据 manifest，并重算其 SQL/HTTP 的金额、快照和个人归档断言，见[复用核对](evidence/issue60/reuse-verification.json)。历史截图未复制成今日操作。

| 验收范围              | 实际执行 / 结果与证据                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 真实登录      | 三账号通过注册 API 准备夹具；本轮 owner 在 App 邮箱/密码输入框登录，真实 login 200 → getMe 200 → 在线空列表。[截图](evidence/issue60/01-owner-online-empty.png)                                                                                                                                                                                                                                                                  |
| 相册取消              | 建账名称 `Issue60-Retained-Draft` → 真实系统相册 → 返回取消，名称和预设封面保留，无上传/建账。[系统相册](evidence/issue60/02-system-cover-picker.png)、[返回](evidence/issue60/03-cancel-retains-name.png)                                                                                                                                                                                                                       |
| 前后台 / 断网门禁     | 未提交建账表单切后台/前台，真实 getMe 响应延迟；核验中点击底层创建位置及返回键，无写入。关闭设备 Wi-Fi/移动数据，迟到 200 及联网后仍停留门禁，显式核验才恢复名称。[核验](evidence/issue60/04-foreground-verifying.png)、[门禁](evidence/issue60/05-offline-late-200-gated.png)、[恢复](evidence/issue60/07-explicit-verification-retains-draft.png)                                                                              |
| 真实 401 与同账号恢复 | SQL 仅撤销本夹具 owner 会话，前台真实 getMe 401；重新登录仍需在线 getMe。断网后迟到 200 不恢复表单，联网不自动提交；显式再次登录才恢复原名称。[撤销 SQL](evidence/issue60/db-revoke-foreground.json)、[401 门禁](evidence/issue60/08-real-401-gate.png)、[迟到后](evidence/issue60/10-reauth-late-200-still-gated.png)、[恢复](evidence/issue60/12-same-account-restores-draft.png)                                              |
| 原生权限              | 手动创建上述账本后，填写未保存消费 ¥60 / `Issue60-Unsaved-Receipt`；真实系统相机权限选择 Don’t allow，输入保留，再打开真实系统相册并取消，仍未保存/上传。[系统权限](evidence/issue60/14-system-camera-permission.png)、[拒权](evidence/issue60/15-camera-denied-keeps-expense.png)、[相册](evidence/issue60/16-system-receipt-picker.png)、[取消后](evidence/issue60/17-receipt-cancel-keeps-expense.png)                        |
| 冷启动在线核验        | force-stop、设备断网后冷启动，只见网络门禁；联网本身不放行。手动核验，真实 refresh 延迟 8 秒期间仍门禁，随后 refresh 200 → getMe 200 才展示在线列表。原未保存消费不跨进程保留。[设备网络](evidence/issue60/cold-offline-device.json)、[冷启动门禁](evidence/issue60/18-cold-start-offline-gate.png)、[refresh 中](evidence/issue60/20-cold-refresh-verifying.png)、[在线列表](evidence/issue60/21-cold-verified-online-list.png) |
| 双账号完整账务闭环    | **复用同一运行时代码的 #58/#59 实操，不重复认领本轮执行**：两真实账号封面建账/加入、收据消费 12000 分、各分摊 6000、只读预览、冻结一笔 6000、整笔已还、结清、本人归档/历史；角色、批次及 SQL/HTTP 详见[原报告](issues58-59-final-acceptance.md)和[原 SQL/HTTP 断言](evidence/issues58-59/native-verification.json)。与当前代码兼容及证据完整性由上述复用核对确认                                                                 |

前两次迟到响应探针使用 12 秒延迟，超过 HTTP 10 秒超时，证明的是断网/超时后不放行；**超时内迟到 200 的精确场景复用相同控制器 `adff4d8` 的原生 8 秒证据**（[原请求](evidence/issues58-59/network-requests.json)），并由本候选自动化重新验证。诊断 hook 只延迟真实响应，不伪造 200/401。USB reverse 保留，故设备报告断网仍可特意收到迟到响应；不是物理弱网测试。

[本轮请求记录与核对](evidence/issue60/native-requests.json)、[恢复前 SQL](evidence/issue60/db-before-recovery.json)、[恢复后 SQL](evidence/issue60/db-after-recovery.json)、[最终 SQL](evidence/issue60/db-final.json)。两个恢复门禁阶段业务行完全相同、账本为 0；之后唯一手动成功写入是 1 个 ACTIVE/version 1 的空账本，1 个创建者成员、总消费 0、消费/图片/结算记录均 0。相机拒权通过重置本 App CAMERA 的测试权限标志再次出现系统对话框，未宣称成功拍摄。

## 当前候选检查与清理

| 实际命令                                                               | 本轮结果 / 完整输出                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                       | [通过](evidence/issue60/install.txt)，锁文件未变                                                                                                                         |
| `pnpm check`                                                           | [候选检查](evidence/issue60/check-source.txt)、[最终交付检查](evidence/issue60/check.txt)通过                                                                            |
| `pnpm test --reporter=verbose`                                         | [19 文件 / 125 项](evidence/issue60/unit.txt)通过，无数据库                                                                                                              |
| `pnpm test:mobile`                                                     | [24 套件 / 244 项](evidence/issue60/mobile.txt)通过；双端组件/API/原生模块替身，不等于原生安装                                                                           |
| 显式 `TEST_DATABASE_URL` 后 `pnpm test:integration --reporter=verbose` | [15 文件 / 136 项](evidence/issue60/integration.txt)通过，真实独立 PostgreSQL                                                                                            |
| `pnpm build:server`                                                    | [通过](evidence/issue60/build-server.txt)                                                                                                                                |
| `pnpm check:mobile-deps`                                               | [依赖匹配](evidence/issue60/dependencies.txt)                                                                                                                            |
| `NODE_USE_ENV_PROXY=1 pnpm doctor:mobile`                              | [21/21](evidence/issue60/doctor.txt)；dlx 内部 pnpm 12.11.2 不代表工作区依赖升级                                                                                         |
| `pnpm export:mobile`                                                   | [Android/iOS JS 导出](evidence/issue60/export.txt)通过，分别于原生安装记录                                                                                               |
| 候选 CI                                                                | `c954dda` 的 [Checks #153](https://github.com/Liangbai2333/tongzhang/actions/runs/40691327469)成功；最终 PR head 的独立 CI 链接和状态写入 PR，旧 SHA 绿灯不替代最终 head |

新增 JS 核对工具首次 lint 缺少显式 Buffer 导入，已补齐并重跑通过；[首次完整输出](evidence/issue60/check-first.txt)保留。采证工具曾因 adb 不在 PATH、SQL 排序引用不存在的 created_at、下载 bundle 时替换 URL 主机导致 sourceURL 不同，以及未等 UI 稳定/点击被裁剪控件而失败；修正为 adb 绝对路径、按首列排序、保留原 URL 只改连接地址、核对稳定系统界面后重跑。冷启动初次 12 秒探针产生续期结果不确定，清除本机凭据并正常登录后以 8 秒重跑；没有修改产品代码、忽略断言或把启动画面当成功门禁。

集成库 public 14 表均 0 行，无其他连接及测试触发器，见[清理审计](evidence/issue60/db-test-cleanup.json)。本轮 API/Metro、专用容器/卷及私有凭据完成采证后清理，设备网络恢复；原开发库和 `tongzhang-48-postgres` 保留，见[资源清理](evidence/issue60/resources-cleanup.txt)。

## Day7 交付给文档负责人的核对项

本报告与 [#61](https://github.com/Liangbai2333/tongzhang/issues/61) 使用同一候选边界，作为文档负责人的可核对交付材料；未代其执行接口索引走查或宣称其已审核。当前入口继续使用[完整操作手册](app-user-guide.md)、[接口索引](api-reference.md)和[已知限制](known-limitations.md)。

1. 从最终候选新 worktree 安装锁定依赖；普通开发按 README 的 `pnpm setup` / `pnpm build:android` / `pnpm dev:android`，API 地址必须是设备可达地址。模拟器可用 adb reverse，物理设备不能照抄本机 127.0.0.1。
2. 复现本轮隔离环境：从仓库根执行 `node docs/evidence/issue60/prepare-environment.mjs`；待 `docker exec tongzhang-60-postgres pg_isready -U postgres` 成功，执行 `docker exec tongzhang-60-postgres createdb -U postgres tongzhang_60_native`，再分别运行 `node docs/evidence/issue60/run-with-env.mjs migrate:db` 和 `PGDATABASE=tongzhang_60_native node docs/evidence/issue60/run-with-env.mjs migrate:db`。准备工具拒绝覆盖同名私有配置；若其他轮验收仍占用该命名，先换任务命名，勿删他人资源。
3. `pnpm build:server` 后运行 `node docs/evidence/issue60/native-api-runner.mjs`；另开终端执行 `APP_VARIANT=development EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3360 pnpm --filter @tongzhang/mobile exec expo start --dev-client --port 8060 --localhost --clear`。`register-fixtures.mjs` 只准备账号，成功业务仍由 App 操作。
4. 设置 `adb reverse tcp:3360 tcp:3360`、`adb reverse tcp:8060 tcp:8060`；核对原生输入后启动 `tongzhang://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8060`。原生输入变化必须重新 `pnpm build:android`（含 Prebuild/安装），保存新 APK 哈希；未变则明确复用及原构建来源。不要手改生成目录。
5. 用 `ADB=<adb绝对路径> node docs/evidence/issue60/verify-loaded-js.mjs` 核对实际加载源码；截图用 `adb exec-out screencap -p`。需复现延迟时将 method/path/delayMs 写入 `/tmp/tz60-control.json`，超时内用 8000 ms；真实断网用 `svc wifi/data disable`，结束恢复 enable。只在专用夹具撤销会话；不改生产数据。
6. Day7 若运行时代码、原生输入、API 环境或设备变化，按影响重新验证并更新候选/实装 APK/实际 JS/当前 CI；新候选不能沿用旧绿灯或只换报告标题。独立迁移、JS 导出、原生构建/安装分别记账。

本轮仍未执行物理设备、iOS 原生安装/完整主链、成功拍摄、物理弱网、签名发布或生产部署。已知 501/扫码限制沿用当前说明；已还是人工登记，不是真实支付。T17 整项 8 点留到 Day7 最终候选按原标准验收后处理。
