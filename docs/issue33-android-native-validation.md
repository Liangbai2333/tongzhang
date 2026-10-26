# Issue #33：Android 原生安装、图片权限与真实联调

2026-10-26，关联 [Issue #33](https://github.com/Liangbai2333/tongzhang/issues/33)。本轮完成 Android 模拟器的安装及图片阶段验证，不代表物理真机、其他成员电脑或 T17 整项验收，不扣减整项点数。

## 版本与运行环境

先执行 `git fetch origin main`、`git merge --ff-only origin/main`，确认主线为 `acbb88b507c56bc641fbc75d1f816d5cb9848eed`，再从 `origin/main` 创建独立 worktree 和 `test/33-android-native` 分支。原工作区的未跟踪冲刺文档未修改。修复源码提交为 `23525f8c21371f8834eaa09365ca43aca7476758`，之后交付仅整理文档及证据。

| 项目        | 本轮实际值                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主机        | macOS 27.0.1 / arm64；Node 24.22.0、工作区 pnpm 12.6.0                                                                                                                   |
| Android     | `Medium_Phone_API_37.0`，`emulator-5554`，Android 17 / API 37，arm64-v8a，1080×2400；没有连接物理设备                                                                    |
| 客户端      | Expo 57.0.31、React Native 0.86.3、React 19.2.3、expo-dev-client 57.0.20、image-picker 57.0.20；App 0.1.0 / versionCode 1，`com.tongzhang.app`；minSdk 24 / targetSdk 36 |
| 原生工具    | Android Emulator 37.2.12；JDK Corretto 17.0.20；Gradle 9.3.1                                                                                                             |
| API / Metro | 本 worktree 编译的 Fastify，`127.0.0.1:3333`；本 worktree Metro `127.0.0.1:8093`；设备使用 `adb reverse`                                                                 |
| 数据库      | 复用健康的开发 PostgreSQL 17.11 容器，127.0.0.1:35432；新建独立 App 库 `tongzhang_issue33` 和集成测试库 `tongzhang_issue33_test`，未修改既有业务库或删除卷               |

[环境明细](evidence/issue33/environment.json)、[环境检查](evidence/issue33/environment-check.json)、[APK、安装时间与源码 SHA-256](evidence/issue33/native-install.json)。Node 比仓库固定的 24.21.0 高一个 patch，环境检查记录为警告，其余适用项通过。APK 99,547,302 字节，SHA-256 为 `79708493305d8245e6e1950d30289fd75a8a42840fcae78298f386492435f005`，本地保留在 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`，未提交构建产物。

## 实际命令与构建结果

本 worktree 根目录为 `/Users/liangbai/.codex/worktrees/issue33-android-native/tongzhang`。应用 `.env` 均未提交；服务端从原有本地配置复制 PG 连接参数，数据库改为上述专用库、PORT 改为 3333；移动端设置 `APP_VARIANT=development`、`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3333`。数据库通过 `pg.Client` 管理连接显式 `CREATE DATABASE`，没有使用 schema push。

```bash
pnpm install --frozen-lockfile
pnpm setup:env
pnpm migrate:db
pnpm build:server
emulator -avd Medium_Phone_API_37.0 -no-snapshot-save
adb devices -l
adb shell getprop sys.boot_completed
JAVA_HOME=/Users/liangbai/.local/share/mise/installs/java/corretto-17.0.20.12.1 \
ANDROID_HOME=/Users/liangbai/Library/Android/sdk pnpm build:android
# API 与 Metro 分别启动；原生验收期间 API 使用下述只记录响应的 runner。
node apps/server/dist/server.js
pnpm --filter @tongzhang/mobile dev --port 8093 --localhost
adb reverse tcp:3333 tcp:3333
adb reverse tcp:8093 tcp:8093
adb shell am start -a android.intent.action.VIEW \
  -d 'tongzhang://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8093' \
  com.tongzhang.app
adb shell dumpsys package com.tongzhang.app
curl -fsS http://127.0.0.1:3333/health/ready
adb exec-out screencap -p > native-screenshot.png
```

首次 Prebuild 后模拟器仍离线，安装命令失败，见[原始失败](evidence/issue33/build-android-first-offline.txt)。确认 `sys.boot_completed=1`、设备为 `device` 后，以 JDK 17 重跑：[第一次成功构建](evidence/issue33/build-android.txt)为 `BUILD SUCCESSFUL in 1m 9s`，475 项任务，随后实际安装 APK 并启动。

修复后再次执行完整 `pnpm build:android`，包含 Prebuild、原生编译与安装，[最终构建](evidence/issue33/build-android-final.txt)为 `BUILD SUCCESSFUL in 25s`。中间曾尝试传 `--port 8093`，Expo 明确拒绝 `--port` 与脚本的 `--no-bundler` 同时使用，见[失败日志](evidence/issue33/build-android-port-conflict.txt)；改回原命令，安装后用上述 deep link 选择 8093。CLI 默认打开的 8081 不作为本轮联调地址。未新增依赖、修改原生配置或手改生成目录。

这是开发 APK，业务 JavaScript 由本 worktree Metro 提供；初次安装后的基线截图与修复后的运行分别标记。最终重装后 force-stop、重新打开 8093，真实 refresh/getMe、账本与收据读取成功，见[最终重装后收据](evidence/issue33/20-final-installed-a-receipt.png)。双端 JS 导出另列，不替代这两次原生编译安装。

## 原生用例、预期与实际结果

通过真实注册 HTTP 接口准备甲、乙、非成员丙三个 `example.test` 账号；甲乙在 Android App 用密码正常登录，未注入会话。注册不是本轮原生界面用例。图片为本轮生成、标明 TEST DATA ONLY 的 800×1000 JPEG，经 `adb push` 和媒体扫描放入模拟器 Pictures，再由系统相册选择；未将历史截图当作本轮收据或原生证据。

| 用例                   | 预期与本次实际                                                                                                        | 原生证据                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录与建账             | 甲登录后为空列表；在 App 创建 `Issue33-Android`，真实 POST 201，邀请码 `VTCB53`、1/12 人                              | [甲登录](evidence/issue33/02-a-login-empty.png)、[建账邀请](evidence/issue33/03-created-invitation.png)                                                                            |
| 乙预览并加入           | App 预览为甲创建、1 人；确认 join 200，数据库变为 2 人。首次跳转暴露 F02，Reload 后正常读取；修复后另两个账本正常加入 | [预览](evidence/issue33/04-b-join-preview.png)、[恢复读取](evidence/issue33/06-b-ledger-after-reload.png)、[第二次复测成员](evidence/issue33/18-join-retest2-members.png)          |
| 系统相册取消           | 未选图取消，消费名称及 ¥120 保留；已选收据后取消重选，原 32 KiB 收据及输入仍在；未发送上传或消费写请求                | [系统相册](evidence/issue33/10-system-photo-picker.png)、[首次取消](evidence/issue33/11-picker-cancel-preserved.png)、[保留原收据](evidence/issue33/14-cancel-keeps-selection.png) |
| 相机拒权               | 拒权提示可从相册选择；已选图片不丢失，用户可继续保存。首次系统拒权暴露 F01，修复后复测                                | [系统权限](evidence/issue33/07-camera-system-permission.png)、[拒权后原收据仍在](evidence/issue33/13-denied-keeps-selection.png)                                                   |
| 选图、压缩、上传及保存 | 乙从系统相册选择图片，转 JPEG 压缩为 32156 字节；手动保存才上传，A18 201 后新增消费 201；两人各 6000 分               | [选图](evidence/issue33/12-selected-receipt.png)、[消费详情](evidence/issue33/15-b-expense-detail.png)                                                                             |
| 两成员授权读取         | 乙和甲分别在原生 App 打开同一张已绑定收据，真实 GET 图片均 200                                                        | [乙读取](evidence/issue33/16-b-authorized-receipt.png)、[甲读取](evidence/issue33/19-a-authorized-receipt.png)、[甲成员身份](evidence/issue33/21-a-members.png)                    |

主账本 ID 为 `6a88fb46-b11c-4dd5-a854-1369fca804a4`，消费 `d83aec3a-c01d-47fe-bdad-17b0cbbd7a0e`，收据 `eef4d1d1-7160-4559-9f87-f52c3b87e3e5`。数据库核对为 ACTIVE/version 3、2 成员、1 消费、2 分摊、1 收据绑定，图片二进制实际长度等于 byte_size，见[SQL 读取结果](evidence/issue33/database.json)。

## 缺陷修复与复测

**F01：系统权限/相册活动返回时卸载业务导航，丢失表单及选择。** 原 `AuthProvider` 将后台事件与实际断网都作为清用户处理，`AuthNavigation` 用恢复页替换整棵 Stack。初次拒权后曾短暂显示旧表单，随后恢复登录状态回到列表；热更新仍持有旧控制器时再次记录了[表单丢失](evidence/issue33/09-before-fix-form-lost.png)。现在仅前后台过渡保留已核验身份及已挂载页面，恢复时必须真实 getMe 成功才解除门禁。恢复界面以原生 Modal 覆盖业务区，屏蔽触摸、无障碍访问与 Android 返回；核验失败、401、会话撤销或真实断网仍清用户并卸载业务区。没有新增业务持久缓存、离线访问、写队列或写操作自动重试。

最终 APK 重装后，使用 `adb shell pm clear-permission-flags com.tongzhang.app android.permission.CAMERA user-set user-fixed` 重置相机拒权标志，重新填写 ¥1.23 / `Android33-Permission`，在[新的系统权限窗口](evidence/issue33/22-final-camera-prompt.png)选择 Don’t allow，真实 getMe 后仍回到原表单并显示拒权提示，见[最终拒权复测](evidence/issue33/23-final-denied-preserved.png)。随后显式放弃该未保存表单，未新增消费。

新增控制器、Provider 生命周期与导航回归：验证核验期间表单不卸载且不可访问、核验通过保留输入、撤销立即卸载、实际断网及核验失败不保留身份。在原主线源码上运行新增用例，移动端 4 项失败、控制器 1 项失败；恢复修复源码后通过。见[移动端修复前](evidence/issue33/auth-regression-before.txt)、[控制器修复前](evidence/issue33/controller-regression-before.txt)、[修复后重点回归](evidence/issue33/auth-tests-after.txt)。这些测试使用替身，不计作真实设备验收。首次热更新保留了旧 controller 实例，复测仍回列表；force-stop 后重新加载最终代码，再连续执行取消、选择、拒权、取消重选及保存通过，不把热更新前失败记录改写为通过。

**F02：确认加入后导航切换，Fabric 报父视图冲突。** join 200、详情 GET 200 后，开发客户端显示 `addViewAt: failed to insert view [2200] into parent [2248]`。[原生错误截图](evidence/issue33/05-before-fix-native-mount-crash.png)及[原生挂载明细](evidence/issue33/native-mount-crash-detail.txt)显示 2200 和 AndroidTextInput 2202 的原父视图为 2204。对照输入框结构，固定 `InviteCodeField` 的原生 field 父节点 `collapsable={false}`，避免 busy 结束与原生栈移除同时发生时父层级折叠。机制参考 [React Native 0.86 View](https://reactnative.dev/docs/0.86/view#collapsable)与 [react-native-screens #4677](https://github.com/software-mansion/react-native-screens/issues/4677)，上游报告仅用于解释线索，不充当本项目复测结果。

修复后由真实 API 额外准备 `Issue33-Join-Retest`、`Issue33-Join-Retest2`，乙在 App 逐次预览、确认加入、进入详情及成员面板，两次均正常、无 Reload，见[第一次详情](evidence/issue33/17-join-retest-detail.png)和[第二次成员](evidence/issue33/18-join-retest2-members.png)。这是本机有限次数的回归，不推断所有 Android 机型都已排除同类原生问题。

其他排查：开发工具悬浮按钮遮住右上角添加入口，拖开后继续；一次自动输入受键盘布局移动影响，将密码附加到账号字段，客户端校验拒绝、未发登录请求，清空后正常登录；并发运行两个 UIAutomator dump 曾触发工具自身 137/服务重复注册，改为串行操作。均未用伪造响应绕过。

## HTTP 图片权限与证据边界

原生用例后另外执行 [11 项真实 HTTP 图片权限与封面核对](evidence/issue33/http-image-permissions.json)：已绑定收据甲乙 200、非成员丙 403、无认证 401；甲乙内容 SHA-256 均为 `ab07f67784f0e5a8f5367fd35e52bf7250bbe64665e0909394aff9b641623bfc`，与 PostgreSQL 保存值一致，响应 `Cache-Control: no-store`。另外上传未绑定 COVER，上传者乙 200、同账本成员甲和丙仍 403；乙通过真实 API 建自定义封面账本绑定后，甲仍作为该账本非成员被拒绝。

自定义封面上传的移动端入口目前明确「暂未开放」，该扩展用例只算 HTTP 验收；原生选图上传采用已经接通的消费收据入口。Android 系统 Photo Picker 只授权用户选择的媒体，本次包未申请全相册读取或录音权限，不能把没有全库权限弹窗记作拒权缺陷。依据为已读取的 [SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)及实际安装包权限。未验收相机成功拍摄、物理真机或生产环境。

原生运行使用本 worktree `buildApp` 加临时 `onSend` 日志 hook，只记录时间、方法、路径、状态、requestId 和非认证 JSON 响应，未记录密码、令牌、Authorization 或幂等键，不修改响应、不延迟业务、不注入会话。[请求时序](evidence/issue33/requests.json)含账号准备、原生操作、扩展 HTTP 检查及最终重装复测，阶段以路径和时间区分。截图 01–07 为初始主线运行，09 为热更新旧控制器仍失败的中间状态，10 起为最终修复源码运行，20 起在最终 APK 重装后补验。截图均由本次 `adb exec-out screencap -p` 保存原始 1080×2400 像素，[文件清单与哈希](evidence/issue33/manifest.json)用于核对；非 Web、设计稿、组件截图或物理真机截图。UTC 时间以请求 JSON 为准，本机显示 America/Los_Angeles。提交的文本日志仅去除行尾空白和末尾多余空行，原始 `.log` 保留本机。

## 检查与交付

| 实际命令                                            | 结果及日志                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                        | 修复后构建、类型、Lint、格式通过；首次检查修正了新增测试的 require 导入及本地 runner 空 catch。[日志](evidence/issue33/check-after.txt) |
| `pnpm test`                                         | 18 文件 / 116 项通过，无数据库。[日志](evidence/issue33/unit-tests-after.txt)                                                           |
| `pnpm test:mobile`                                  | iOS/Android 22 套件 / 184 项通过。[日志](evidence/issue33/mobile-tests-after.txt)                                                       |
| 显式 `TEST_DATABASE_URL` 后 `pnpm test:integration` | 专用 PostgreSQL 测试库，14 文件 / 128 项通过；服务端源码未修改。[日志](evidence/issue33/integration-tests.txt)                          |
| `pnpm check:mobile-deps`                            | 依赖匹配 SDK 57，无锁文件改动。[日志](evidence/issue33/mobile-deps.txt)                                                                 |
| `NODE_USE_ENV_PROXY=1 pnpm doctor:mobile`           | 修复后 21/21。[日志](evidence/issue33/doctor-after.txt)                                                                                 |
| `pnpm export:mobile`                                | 修复后 Android/iOS JS 导出通过，无 Web 构建；不算 APK 安装。[日志](evidence/issue33/export-after.txt)                                   |
| `pnpm build:android`                                | 两次实际构建并安装，最终重装后原生读取通过，详见前文                                                                                    |

PR 的 CI 必须以当前 head 的 `check` 和 `container` 检查为准，不能套用历史 PR 的绿灯。提交及 PR 关联本日 #33，不修改 T17 整项点数；由系统架构负责人审查后合并，本轮不执行合并。
