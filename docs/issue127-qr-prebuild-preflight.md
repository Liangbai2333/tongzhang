# #127 Beta Day 3 扫码 Prebuild 构建说明核对与中期独立安装验收预检

2026-11-18（Beta 冲刺第 3 天）。本轮构建与核对代码基线为 `82c69aa`（最新 `main`，已合入 `#121` / `B07` `expo-camera` 扫码加入、`B08` 多维统计与资料编辑及 `#122`/`#123`/`#124` 后端增量）。

> **措辞与验收口径声明**：本记录属于 **Beta Day 3 当天核对预检**，用于在 `B07` 接入 `expo-camera` 并完成 Android Prebuild 后核对构建说明第一屏、依赖一致性与扫码/相机拒权回退路径，**不等同于明日 Day 4（2026-11-19）第一次正式干净环境独立安装验收（`B12`）**。`B12` 整项 4 点仍按计划待明日正式独立安装验收通过并经双关口确认后核销，本单不重复估点、不提前扣减点数。

## 四栏当天核对预检记录（扫码加入入口与相机权限拒绝回退）

| 版本      | 环境 | 步骤                                                                                                                                                                                           | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `82c69aa` | A    | 小白（`member@beta127.test`）登录新构建的 Android 开发客户端，在账本列表右上角点「+」→「加入账本」，核对「加入账本」页的「6 位邀请码」输入框、「扫码加入」按钮及下方提示文案。                 | **通过**。页面正常展示 6 位邀请码输入框、「扫码加入」次按钮及更新后的指引文案（「请账本创建者在账本中点「邀请成员」，扫描邀请二维码或输入 6 位邀请码即可加入。」），无白屏或布局遮挡。[加入账本入口 01](evidence/issue127-qr-prebuild-preflight/01-join-ledger-with-qr-entry.png)                                                                                                                                                                                                                                                                                                                          |
| `82c69aa` | A    | 在「加入账本」页首次点击「扫码加入」，待 Android 17 系统弹出相机运行时权限弹窗后，点击「Don’t allow」拒绝本次授权。                                                                            | **通过**。系统正确弹出「Allow 同账 to take pictures and record video?」权限弹窗（无录音权限请求）；点拒绝后 App 留在当前「加入账本」手输页，无白屏或闪退，卡片内联显示「未获得相机权限，请直接在上方输入 6 位邀请码加入。」，上方 6 位输入框与底部「查看账本」按钮保持可用。[系统相机权限弹窗 02](evidence/issue127-qr-prebuild-preflight/02-camera-permission-prompt.png) · [首次拒权回退手输页 03](evidence/issue127-qr-prebuild-preflight/03-camera-denied-once-fallback.png)                                                                                                                           |
| `82c69aa` | A    | 紧接上一步，再次点击「扫码加入」并在系统权限弹窗再次点击「Don’t allow」，触发 Android 永久拒权（`canAskAgain: false`）。                                                                       | **通过**。页面仍停留在「加入账本」手输页，除「未获得相机权限，请直接在上方输入 6 位邀请码加入。」外，自动展示「前往系统设置开启相机」快捷按钮，供用户按需跳转系统设置；全程无崩溃或卡死。[永久拒权与设置入口提示 04](evidence/issue127-qr-prebuild-preflight/04-camera-denied-permanent-settings-hint.png)                                                                                                                                                                                                                                                                                                 |
| `82c69aa` | A    | 保持相机权限处于拒绝状态，直接在上方 6 位邀请码输入框手输创建者小安（`owner@beta127.test`）的「扫码预检账本」有效邀请码 `L6GPPV`，收起键盘后点「查看账本」，在确认面板点「加入扫码预检账本」。 | **通过**。相机拒权不阻塞手输主路径：`POST /api/v1/invitations/preview` 返回 `200` 并弹出「确认加入这个账本？」面板（「扫码预检账本」、「创建者：小安」、「账本成员：1 / 12 人」）；确认后 `POST /api/v1/invitations/join` 返回 `200` 并进入账本详情，右上角显示「查看成员 · 2 / 12」。核对隔离库 `beta127`：`ledgers.version` 由 `1` 升至 `2`，`ledger_members` 为 `2` 行，`operation_logs` 记 `MEMBER_JOINED=1`。[手输回退预览 05](evidence/issue127-qr-prebuild-preflight/05-fallback-manual-preview.png) · [手输回退加入成功 06](evidence/issue127-qr-prebuild-preflight/06-fallback-manual-joined.png) |
| `82c69aa` | A    | 为 `com.tongzhang.app` 授予 `android.permission.CAMERA` 后，返回账本列表再次点「+」→「加入账本」→「扫码加入」；确认相机取景面板加载后，点击底部「改用手输邀请码」。                            | **通过**。授予权限后直接弹出「扫描邀请二维码」底部面板（`QrScannerSheet`），`CameraView` 成功唤起模拟器后置虚拟相机画面并渲染圆角扫描框与引导文案「将账本创建者的邀请二维码放入框内，识别后将自动核对账本信息。」，系统状态栏点亮绿色相机使用指示灯；点击「改用手输邀请码」后面板平滑关闭并回到「加入账本」手输页，无残留黑屏。[相机扫码面板打开 07](evidence/issue127-qr-prebuild-preflight/07-qr-scanner-camera-open.png) · [关闭回手输页 08](evidence/issue127-qr-prebuild-preflight/08-qr-scanner-closed-to-manual.png)                                                                                |

## 启动说明第一屏逐项核对（扫码 Prebuild 后）

对照 [成员环境配置（启动前必看）](environment-setup.md#启动前必看) 逐项实操核对，并已同单在第一屏补充 `B07` 引入 `expo-camera` 后的相机权限与原生重建要求：

| 核对项               | 实操与核对结论                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编译与安装命令       | 在新工作树执行 `pnpm install --frozen-lockfile`、`pnpm build:shared`、`cd apps/mobile && pnpm exec expo prebuild --platform android --no-install`、`cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4` 与 `adb install -r`，构建成功（475 tasks，`1m 25s`）且安装返回 `Success`；与 `pnpm build:android` 串联步骤一致。 |
| 相机权限配置说明     | 核对 `apps/mobile/app.config.ts` 中 `expo-camera` 插件（`cameraPermission: '允许同账使用相机扫描账本邀请码'`、`microphonePermission: false`、`recordAudioAndroid: false`）；Prebuild 生成的 `AndroidManifest.xml` 正确包含 `android.permission.CAMERA` 并以 `tools:node="remove"` 移除 `RECORD_AUDIO`，已在第一屏补充“旧包不可复用、须重建”说明。                    |
| 依赖一致性与自检     | `pnpm check:mobile-deps`（`expo install --check`）输出 `Dependencies are up to date`；`pnpm doctor:mobile`（`expo-doctor@1.21.5`）输出 `21/21 checks passed. No issues detected!`；均保留原始日志。                                                                                                                                                                  |
| 端口与 `adb reverse` | 独立演练端口沿用 API `3374`、Metro `8074`（默认开发组合为 `3300`/`8081`），执行两条 `adb reverse` 后 `adb reverse --list` 均可查，客户端加载 Metro JS 与访问 API 正常。                                                                                                                                                                                              |
| JDK 17 与失败日志    | 显式指定 Corretto JDK `17.0.20.1` 与 `ANDROID_HOME` 后完成 Prebuild 与 Gradle 编译；第一屏保留禁用 JDK 25 提示及两份 Alpha 历史失败日志链接。                                                                                                                                                                                                                        |

## 环境 A、新构建提交与 `base.apk` SHA-256

- **新构建提交（完整哈希）**：`82c69aa84129d4efd223b14e223e9bc1d3053221`（短哈希 `82c69aa`），服务端、Metro JS 与本次新构建 Android 开发客户端均来自同一提交。
- **新构建 APK 与模拟器内 `base.apk` SHA-256（一致）**：

```text
282d9ce7d7102cb30bd49436249218ff099bada0ea1e1dfb8117923495cb8a5f
```

- **独立模拟器与宿主机环境**：空白隔离 AVD `Beta127`（`emulator-5584`，`-no-snapshot -wipe-data -gpu swiftshader_indirect`，Android 17 / API 37、`arm64-v8a`、`1080 × 2400`，后置虚拟相机 `virtualscene`）；宿主机 macOS ARM64、Expo SDK 57、Node `v24.22.2`、pnpm `12.6.0`、Corretto JDK `17.0.20.1`、Docker `29.8.2` / Compose `5.5.1`、独立 PostgreSQL 17 容器库 `beta127`（宿主机端口 `35527`，执行 `pnpm migrate:db` 初始化 15 张表）。
- **复现端口转发与启动命令**：API 监听 `PORT=3374`，移动端 `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3374`，Metro 以 `--dev-client --port 8074` 启动；完整 Manifest 权限摘录、APK 哈希、HTTP 请求与 PostgreSQL 快照见 [runtime-checks.txt](evidence/issue127-qr-prebuild-preflight/runtime-checks.txt)。

```sh
adb -s emulator-5584 reverse tcp:3374 tcp:3374
adb -s emulator-5584 reverse tcp:8074 tcp:8074
adb -s emulator-5584 reverse --list
adb -s emulator-5584 shell am start -a android.intent.action.VIEW \
  -d 'tongzhang://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8074' com.tongzhang.app
```

## 依赖一致性、导出与环境诊断保留日志清单

| 检查命令                          | 用途与边界说明                                                                                                                 | 结果摘要                                                                                                                             | 保留日志文件名                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm check:mobile-deps`          | 执行 `expo install --check` 核对合入 `expo-camera` 后的 Expo SDK 57 依赖一致性                                                 | 通过：`Dependencies are up to date`                                                                                                  | [pnpm-check-mobile-deps.txt](evidence/issue127-qr-prebuild-preflight/pnpm-check-mobile-deps.txt) |
| `pnpm doctor:mobile`              | 执行 `expo-doctor@1.21.5` 21 项工程配置与原生自检                                                                              | 通过：`21/21 checks passed. No issues detected!`                                                                                     | [pnpm-doctor-mobile.txt](evidence/issue127-qr-prebuild-preflight/pnpm-doctor-mobile.txt)         |
| `pnpm export:mobile`              | 验证共享包编译及 Android / iOS 双端 Metro JS Bundle 导出（**仅代表 JS 打包导出通过，不等同于原生编译或干净环境独立安装验收**） | 通过：Android bundle `4.9MB`、iOS bundle `4.6MB` 导出成功                                                                            | [pnpm-export-mobile.txt](evidence/issue127-qr-prebuild-preflight/pnpm-export-mobile.txt)         |
| `pnpm check:env --tools-only`     | 只读核对 Node、pnpm、Docker 与 Compose 工具链版本                                                                              | 通过：pnpm `12.6.0`、Docker `29.8.2`、Compose `5.5.1` 通过；Node `v24.22.2`（与 `.node-version` `24.21.0` 同属 24 LTS，预期 `warn`） | [pnpm-check-env-tools.txt](evidence/issue127-qr-prebuild-preflight/pnpm-check-env-tools.txt)     |
| `pnpm check:env --android --json` | 只读核对 JDK 17、Android SDK、隔离 PostgreSQL 连通性与 API `/health/ready` 状态                                                | 通过：`ok: true`（Java `17.0.20.1`、Android SDK、`SELECT 1` 与 API 就绪均 `pass`）                                                   | [pnpm-check-env-android.txt](evidence/issue127-qr-prebuild-preflight/pnpm-check-env-android.txt) |
| 运行与构建核对摘录                | 记录新构建提交哈希、APK/设备 `base.apk` SHA-256、Manifest 权限、API HTTP 日志与 PostgreSQL 快照                                | 通过：`CAMERA` 已声明、`RECORD_AUDIO` 已移除、手输回退加入库状态一致                                                                 | [runtime-checks.txt](evidence/issue127-qr-prebuild-preflight/runtime-checks.txt)                 |

## 格式核对、复核与点数口径

- 本单为 Beta 冲刺第 3 天（2026-11-18）当天核对预检任务，关联 `B12`（整项 4 点，计划明日 Day 4 / 2026-11-19 完成第一次正式干净环境独立安装验收后核销）；今日不重复估点，不提前扣减 `B12` 整项点数。
- 四栏要素格式待李润君（@range-e）确认合规并留下书面批注，步骤与结果待陈林祺（@lllin7）复核。
