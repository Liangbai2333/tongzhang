# #141 Beta Day 4 第一次正式验收（B12）：干净环境独立安装与登录至建账回归

2026-11-19（Beta 冲刺第 4 天）。本记录对应 [#141](https://github.com/Liangbai2333/tongzhang/issues/141)（任务 `B12`，整项 4 点），属于 **Beta 冲刺第一次正式验收**。

> **验收口径声明**：本次在完全独立的新工作树、独立 PostgreSQL 17 容器与空白隔离 Android 17 模拟器中，严格依据 [成员环境配置（启动前必看）](environment-setup.md#启动前必看) 从 `b859ba9` 重新执行 `expo prebuild`、Gradle 原生构建与 `adb install`，未复用任何旧开发客户端，未修改开发库或业务代码；全部业务与权限验证均由新装 Android 客户端直连同版本本地 Fastify API 与 PostgreSQL 17 完成。本次验收不宣称已完成物理真机、iOS 完整主链、线上 HTTPS 或生产发布签名包验收。

## 四栏正式验收记录（登录至建账与扫码入口/拒权回退）

| 版本      | 环境 | 步骤                                                                                                                                                              | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b859ba9` | A    | 严格按启动说明第一屏完成 JDK 17 + `ANDROID_HOME` 原生构建、全新安装 `app-debug.apk` 并配置 `adb reverse`（`3300`、`8081`）后，启动同账开发客户端。                | **通过**。冷启动进入「同账 TongZhang」真实欢迎页，展示主插画、「开始使用」与「已有账号？ 登录」按钮，无白屏或闪退。[新装欢迎页 01](evidence/issue141-b12-first-acceptance/01-fresh-welcome.png)                                                                                                                                                                                                                                                                                                                                                                                          |
| `b859ba9` | A    | 在欢迎页点「开始使用」进入注册页，填写用户名 `b12owner`、邮箱 `owner@b12.test`、密码与确认密码，勾选「同意用户协议与隐私说明」后点「注册并开始」。                | **通过**。`POST /api/v1/auth/register` 返回 `201`，随后自动完成 `GET /api/v1/me`（`200`）与 `GET /api/v1/ledgers?limit=20&archived=false`（`200`），进入空账本列表，顶部问候「早上好，b12owner」，列表提示「还没有账本」，底部「账本」「我的」双标签常驻。[注册进入空列表 02](evidence/issue141-b12-first-acceptance/02-register-owner-empty-list.png)                                                                                                                                                                                                                                   |
| `b859ba9` | A    | 切至底部「我的」标签 → 点「账户信息」→ 点「重新核验登录状态」，核对服务端在线会话核验响应与页面状态提示。                                                         | **通过**。触发真实 `GET /api/v1/me` 返回 `200`；「账户信息」面板展示「当前账号已在线核验」、用户名 `b12owner` 及只读邮箱 `owner@b12.test`（提示「邮箱暂不支持修改。」）。[在线会话核验 03](evidence/issue141-b12-first-acceptance/03-online-session-verified.png)                                                                                                                                                                                                                                                                                                                        |
| `b859ba9` | A    | 切回「账本」标签，点右上角「+」→「创建账本」，填写账本名称 `B12-Acceptance`（使用默认预设封面），点「创建并邀请成员」。                                           | **通过**。`POST /api/v1/ledgers` 返回 `201`，自动跳转「邀请一起记账」页，展示账本名 `B12-Acceptance`、`b12owner（我）`、`当前 1 / 12 人`、真实 6 位邀请码 `XD3 EHF`（`XD3EHF`）、二维码与 7 天有效期；隔离库 `ledgers` 写入 `ACTIVE` / `version=1`，`operation_logs` 记 `LEDGER_CREATED=1`。[新建账本与邀请页 04](evidence/issue141-b12-first-acceptance/04-created-ledger-invitation.png)                                                                                                                                                                                               |
| `b859ba9` | A    | 返回账本列表，进入「我的」→「退出登录」→「确认退出」；在欢迎页点「已有账号？ 登录」，输入已注册第二账号 `member@b12.test`（用户名 `b12member`）及密码点「登录」。 | **通过**。`POST /api/v1/auth/logout` 返回 `200` 并返回欢迎页提示「已退出登录。」；随后 `POST /api/v1/auth/login` 返回 `200` 并执行 `GET /api/v1/me`（`200`）与 `GET /api/v1/ledgers`（`200`），成功进入 `b12member` 账本列表。[第二账号登录列表 05](evidence/issue141-b12-first-acceptance/05-member-login-list.png)                                                                                                                                                                                                                                                                     |
| `b859ba9` | A    | 在 `b12member` 账本列表右上角点「+」→「加入账本」，核对「6 位邀请码」输入框、「扫码加入」按钮与获取邀请码说明文案。                                               | **通过**。页面完整呈现「6 位邀请码」6 格输入框、「扫码加入」次按钮、「如何获取邀请码？」提示卡片及底部「查看账本」按钮，无布局遮挡。[加入账本与扫码入口 06](evidence/issue141-b12-first-acceptance/06-join-ledger-qr-entry.png)                                                                                                                                                                                                                                                                                                                                                          |
| `b859ba9` | A    | 在「加入账本」页首次点击「扫码加入」，待 Android 17 系统弹出相机运行时权限弹窗后，点击「Don’t allow」拒绝本次授权。                                               | **通过**。系统弹出「Allow 同账 to take pictures and record video?」权限弹窗（无录音权限请求）；拒绝后留在「加入账本」手输页，无白屏或闪退，卡片内联显示「未获得相机权限，请直接在上方输入 6 位邀请码加入。」，手输框与「查看账本」保持可用。[相机权限弹窗 07](evidence/issue141-b12-first-acceptance/07-camera-permission-prompt.png) · [首次拒权回退 08](evidence/issue141-b12-first-acceptance/08-camera-denied-once-fallback.png)                                                                                                                                                     |
| `b859ba9` | A    | 再次点击「扫码加入」并在系统权限弹窗再次点击「Don’t allow」，触发 Android 永久拒权（`canAskAgain: false`）。                                                      | **通过**。设备权限状态转为 `granted=false`（`USER_SET`、`USER_FIXED`）；页面留在手输页并保留内联提示，同时自动展示「前往系统设置开启相机」快捷按钮，全程无崩溃或卡死。[永久拒权与设置入口 09](evidence/issue141-b12-first-acceptance/09-camera-denied-permanent-settings.png)                                                                                                                                                                                                                                                                                                            |
| `b859ba9` | A    | 保持相机权限处于永久拒绝状态，在上方输入框手输 `XD3EHF`，点「查看账本」核对预览，再点「加入B12-Acceptance」。                                                     | **通过**。拒权不阻塞手输路径：`POST /api/v1/invitations/preview` 返回 `200` 并弹出「确认加入这个账本？」面板（`B12-Acceptance`、`创建者：b12owner`、`账本成员：1 / 12 人`）；确认后 `POST /api/v1/invitations/join` 返回 `200` 并进入账本详情，右上角显示「查看成员 · 2 / 12」。隔离库核对：`ledgers.version` 由 `1` 升至 `2`，`ledger_members` 共 `2` 行，`operation_logs` 记 `MEMBER_JOINED=1`。[手输回退预览 10](evidence/issue141-b12-first-acceptance/10-fallback-manual-preview.png) · [手输回退加入成功 11](evidence/issue141-b12-first-acceptance/11-fallback-manual-joined.png) |
| `b859ba9` | A    | 为 `com.tongzhang.app` 授予 `android.permission.CAMERA` 后，返回列表再进「+」→「加入账本」→「扫码加入」；确认取景画面与扫描框渲染后，点底部「改用手输邀请码」。   | **通过**。授权后立即弹出「扫描邀请二维码」底部面板，`CameraView` 唤起模拟器后置虚拟相机画面并渲染黄色圆角扫描框与引导文案，状态栏点亮绿色相机指示灯；点「改用手输邀请码」后平滑关闭并返回「加入账本」手输页，无残留黑屏。[扫码取景面板开启 12](evidence/issue141-b12-first-acceptance/12-qr-scanner-camera-open.png) · [关闭回手输页 13](evidence/issue141-b12-first-acceptance/13-qr-scanner-closed-to-manual.png)                                                                                                                                                                      |

## 启动说明第一屏逐项实操核对

严格按 [成员环境配置（启动前必看）](environment-setup.md#启动前必看) 在干净工作树与空白 AVD 逐步执行：

| 第一屏要求   | 实操核对结果                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地端口     | 启动前确认 API `3300` 与 Metro `8081` 均未被占用；服务端监听 `3300`、Metro 监听 `8081`，与第一屏默认端口完全一致。                                                                       |
| Android 转发 | 模拟器启动后执行 `adb -s emulator-5586 reverse tcp:3300 tcp:3300` 与 `adb -s emulator-5586 reverse tcp:8081 tcp:8081`，`adb reverse --list` 两条均在列，App 访问本地 API 与 Metro 正常。 |
| JDK 与 SDK   | 未设 `ANDROID_HOME` 时 Gradle 立即按预期失败（见失败日志 `build-failed-missing-sdk.txt`）；按第一屏设置 `JAVA_HOME` 为 Corretto JDK `17.0.20.1` 与 `ANDROID_HOME` 后一次编译通过。       |
| 相机与重建   | 全新执行 `expo prebuild --platform android --no-install` 生成 `AndroidManifest.xml`，确认声明 `CAMERA` 并移除 `RECORD_AUDIO`；`pnpm check:mobile-deps` 与 `pnpm doctor:mobile` 全通过。  |

## 环境 A、新构建提交与 `base.apk` SHA-256

- **新构建提交（完整哈希）**：`b859ba929f00be1c23cd83cb4da3328e36ee2209`（短哈希 `b859ba9`），服务端、Metro JS 与本次新构建 Android 开发客户端全部来自同一提交。
- **宿主机 `app-debug.apk`（`99,547,334` 字节）与设备内 `base.apk` SHA-256（一致）**：

```text
3cbcb6a31d70efbc3cf2c081410a22d15af66ff29d8991aec3b3960230eac806
```

- **干净独立运行环境**：
  - 独立工作树：`/Users/liangbai/Homework/tongzhang-141-b12-acceptance`（自最新 `origin/main` `b859ba9` 检出，不修改开发库与其他工作树）。
  - 宿主机工具链：macOS ARM64、Node `v24.21.0`（与 `.node-version` 完全一致）、pnpm `12.6.0`、Corretto JDK `17.0.20.1`、Android SDK Platform 36 / Build-Tools 36.0.0 / NDK 27.1.12297006、Docker `29.8.2` / Compose `5.5.1`。
  - 独立数据库：新建临时容器 `tongzhang-b12-acceptance-db`（`postgres:17-alpine`，端口 `127.0.0.1:35541`，库名 `tongzhang_b12`，执行 `pnpm migrate:db` 初始化全部 15 张表，验收后已停止清理）。
  - 独立模拟器：空白隔离 AVD `Beta141`（`emulator-5586`，`-no-snapshot -wipe-data -gpu swiftshader_indirect`，Android 17 / API 37、`arm64-v8a`、`1080 × 2400`，后置虚拟相机 `virtualscene`，验收后已停止清理）。

```sh
adb -s emulator-5586 reverse tcp:3300 tcp:3300
adb -s emulator-5586 reverse tcp:8081 tcp:8081
adb -s emulator-5586 reverse --list
adb -s emulator-5586 shell am start -a android.intent.action.VIEW \
  -d 'tongzhang://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081' com.tongzhang.app
```

## 成功与失败原始日志文件名清单

所有原始日志均归档于 [docs/evidence/issue141-b12-first-acceptance/](evidence/issue141-b12-first-acceptance/)：

| 类别     | 检查/构建命令                                                                     | 结果摘要                                                                                                   | 原始日志文件名                                                                                      |
| -------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 失败日志 | 未设置 `ANDROID_HOME` 执行 `./gradlew app:assembleDebug`                          | **失败（预期）**：`BUILD FAILED in 19s`，报 `SDK location not found`，验证第一屏必须设置 `ANDROID_HOME`    | [build-failed-missing-sdk.txt](evidence/issue141-b12-first-acceptance/build-failed-missing-sdk.txt) |
| 成功日志 | 设置 JDK 17 + `ANDROID_HOME` 执行 `expo prebuild --platform android --no-install` | **通过**：生成原生工程，`CAMERA` 已声明、`RECORD_AUDIO` 已移除                                             | [expo-prebuild-android.txt](evidence/issue141-b12-first-acceptance/expo-prebuild-android.txt)       |
| 成功日志 | 设置 JDK 17 + `ANDROID_HOME` 执行 `./gradlew app:assembleDebug`（`arm64-v8a`）    | **通过**：`BUILD SUCCESSFUL in 1m 26s`（475 tasks: 443 executed, 32 up-to-date）                           | [build-success-jdk17.txt](evidence/issue141-b12-first-acceptance/build-success-jdk17.txt)           |
| 成功日志 | `adb -s emulator-5586 install app-debug.apk`                                      | **通过**：`Performing Streamed Install` → `Success`，设备 `base.apk` 与本地 APK SHA-256 一致               | [adb-install-success.txt](evidence/issue141-b12-first-acceptance/adb-install-success.txt)           |
| 依赖自检 | `pnpm check:mobile-deps`                                                          | **通过**：`Dependencies are up to date`                                                                    | [pnpm-check-mobile-deps.txt](evidence/issue141-b12-first-acceptance/pnpm-check-mobile-deps.txt)     |
| 工程自检 | `pnpm doctor:mobile`                                                              | **通过**：`21/21 checks passed. No issues detected!`                                                       | [pnpm-doctor-mobile.txt](evidence/issue141-b12-first-acceptance/pnpm-doctor-mobile.txt)             |
| JS 导出  | `pnpm export:mobile`                                                              | **通过**：Android bundle `4.9MB`、iOS bundle `4.6MB`（仅作 JS 打包校验，不代替原生安装验收）               | [pnpm-export-mobile.txt](evidence/issue141-b12-first-acceptance/pnpm-export-mobile.txt)             |
| 环境自检 | `pnpm check:env --tools-only`                                                     | **通过**：Node `v24.21.0`、pnpm `12.6.0`、Docker `29.8.2`、Compose `5.5.1` 全部 `pass`                     | [pnpm-check-env-tools.txt](evidence/issue141-b12-first-acceptance/pnpm-check-env-tools.txt)         |
| 环境自检 | `pnpm check:env --android --json`                                                 | **通过**：`ok: true`（JDK `17.0.20.1`、Android SDK、隔离库 `SELECT 1` 与 API `/health/ready` 全部 `pass`） | [pnpm-check-env-android.txt](evidence/issue141-b12-first-acceptance/pnpm-check-env-android.txt)     |
| 运行摘录 | APK 哈希、权限状态、API HTTP 日志与 PostgreSQL 终态快照                           | **通过**：注册、登录、会话核验、建账、退出、预览、加入与相机权状态均与隔离库 `tongzhang_b12` 终态一致      | [runtime-checks.txt](evidence/issue141-b12-first-acceptance/runtime-checks.txt)                     |

## 复核与点数核销口径

- 负责人：詹铖煜（`@sunny-light233`）；四栏格式核对：李润君（`@range-e`）；步骤复核：陈林祺（`@lllin7`）。
- 本次记录仅归档实际执行证据，**不代写任何成员的书面审查或复核批注**；待李润君在对应 PR 确认四栏格式合规、陈林祺按步骤复核通过并经许雅欣/饶恩哲双关口确认后，核销 `B12` 整项 `4` 点并关闭 [#141](https://github.com/Liangbai2333/tongzhang/issues/141)。
