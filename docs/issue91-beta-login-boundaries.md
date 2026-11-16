# #91 Beta Day 1 登录至建账四栏测试记录

2026-11-16。测试基线为 `9f45c5d`，包含 [#97 启动说明](https://github.com/Liangbai2333/tongzhang/pull/97)和 Alpha 后续导航增量。B02 要求的人工格式确认及独立复走签收由 Issue 指定成员完成。

| 版本      | 环境 | 步骤                                                                                                                                                                                                               | 结果                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `9f45c5d` | A    | 用已登记测试邮箱与故意填写的错误密码登录。                                                                                                                                                                         | **通过**。停在登录页，提示「账号或密码错误」。[截图 01](evidence/issue91-beta-login-boundaries/01-wrong-password.png)                                                                                                                                                                                                                                                                             |
| `9f45c5d` | A    | 将账号改为格式有效但从未登记的邮箱，提交登录。                                                                                                                                                                     | **通过**。同样提示「账号或密码错误」，仍停留在登录页。[截图 02](evidence/issue91-beta-login-boundaries/02-unregistered-email.png)                                                                                                                                                                                                                                                                 |
| `9f45c5d` | A    | 正确登录并看见预置账本。强制停止 App，关闭模拟器 Wi-Fi 和移动数据，保留 ADB 的 API 和 Metro 转发，重新打开开发客户端。页面稳定后，点击「退出并返回登录」，进入登录页，用正确凭据提交。                             | **业务门禁通过，首屏文案需对齐**。带会话冷启动首先显示「暂时无法核验登录状态」，没有显示之前的账本。返回登录后，提交仍提示「网络未连接，请联网后重试」。[在线对照 03](evidence/issue91-beta-login-boundaries/03-online-ledger.png) · [离线冷启 04](evidence/issue91-beta-login-boundaries/04-offline-cold-start.png) · [断网登录 05](evidence/issue91-beta-login-boundaries/05-offline-login.png) |
| `9f45c5d` | A    | 恢复网络，显式登录。在账本列表点右上角「+」→「创建账本」。从相册选择自定义封面，点系统相册的「Done」，等预览显示。保持名称为空，点「创建并邀请成员」。然后在同一名称字段输入三个普通空格，收起键盘，再点同一按钮。 | **通过**。两次均提示「请输入 1–40 个字符的账本名称」，停在表单，自定义封面预览保留。两次尝试后核对隔离库，账本、邀请和封面图片计数与提交前一致。[封面预览 06](evidence/issue91-beta-login-boundaries/06-cover-selected.png) · [空名称 07](evidence/issue91-beta-login-boundaries/07-empty-name.png) · [纯空白名称 08](evidence/issue91-beta-login-boundaries/08-whitespace-name.png)              |

## 环境 A 与复走准备

- **新构建提交 `9f45c5d44e4b1620e6e4d4bbd5a2cd6d3796bb03`**，同一提交提供 Metro JS 和 API。Android 17/API 37 / ARM64，独立 AVD Beta91（`emulator-5584`，1080 × 2400），Expo SDK 57，Node 24.22.2、pnpm 12.6.0、Corretto 17.0.20.1。数据库为已执行仓库迁移的独立 PostgreSQL 17 库 `beta91`。
- 测试账号用真实注册接口准备，并预置一条可辨识的账本供在线与断网对照。覆盖的登录、相册及提交动作均从 App 操作。相册先放一张测试 PNG，本轮使用仓库图标。复走时可换成自己的专用账号、账本名和测试 PNG。
- 在新目录执行 `pnpm install --frozen-lockfile`、`pnpm build:server`。设置隔离库的 `PG*` 参数后运行 `pnpm migrate:db`。API 使用 `PORT=3374`，移动端使用 `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3374`。
- API 用 `pnpm --filter @tongzhang/server start`，Metro 用 `pnpm --filter @tongzhang/mobile exec expo start --dev-client --port 8074`。先检查 `/health/ready` 和 Metro `/status`，安装开发客户端后执行下方两条转发。可使用下面的开发客户端地址开启应用，首次进入时关闭 Expo 开发工具提示。若右上角 Expo 浮动按钮挡住「+」，在 Expo 开发菜单的 Tools 下关闭「Tools button」。
- 断网步骤保留 ADB reverse，使开发客户端能加载 JS 并呈现 App 自身的登录门禁。设备的 Wi-Fi 和移动数据都处于关闭状态。账户仍有本地会话时，等核验错误页出现后再操作。网络恢复后重新提交登录。
- [HTTP 与 SQL 核对](evidence/issue91-beta-login-boundaries/runtime-checks.txt)。SQL 读数：空/纯空白名称测试前后，各为 1 个账本、1 条邀请码、0 个封面图片。空白输入为普通空格，未选择其他封面或重新进入页面。

```sh
adb -s <序列号> reverse tcp:3374 tcp:3374
adb -s <序列号> reverse tcp:8074 tcp:8074
adb -s <序列号> reverse --list
adb -s <序列号> shell am start -a android.intent.action.VIEW \
  -d 'tongzhang://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8074' com.tongzhang.app
```

以 JDK 17 和 Android SDK 运行 `pnpm exec expo prebuild --platform android --no-install`（位于 `apps/mobile`），再在生成的 `android` 目录执行 `./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4`。构建成功，`adb install` 返回 `Success`。安装后的 `base.apk` 与构建产物 SHA-256 一致：

```text
46bded20357008eca49deda986670bedc190c7ae1078dd5dcacc099a369649dc
```

## 启动说明第一屏复核

| 核对项                | 实操与结论                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API 3374、Metro 8074  | 3374 的 `/health/ready` 返回 PostgreSQL 已连接，8074 的 `/status` 返回 `packager-status:running`。默认开发组合的 3300/8081 在文档中另列。                                                                                                                                           |
| `adb reverse`         | 对 Beta91 实行两条同端口转发，`adb reverse --list` 均可查，实际客户端可以加载 JS 和调用 API。                                                                                                                                                                                       |
| JDK 17 与 Android SDK | 显式选择 Corretto 17.0.20.1 和 `ANDROID_HOME` 后完成 Prebuild、Gradle、安装。                                                                                                                                                                                                       |
| 两份历史失败日志      | [环境配置第一屏](environment-setup.md#启动前必看)可直达[缺少 SDK](evidence/day7-delivery/build-first-missing-sdk.txt)与[JDK 25 的 CMake 失败](evidence/day7-delivery/build-second-jdk25.txt)；[开发说明](development.md)首段链接到该表。两份是 Alpha 历史日志，本轮复核入口与内容。 |

[PR #97 第一屏核对批注](https://github.com/Liangbai2333/tongzhang/pull/97#issuecomment-6920567071)。

## B02 签收

格式由李润君核对。陈林祺按上述书面步骤复走后签收。断网项的 Issue 用语是「冷启动停在登录页」，有保存会话时的实际入口是「登录核验恢复页」；请在签收时确认验收口径。B02 的 4 点在双关口通过后核销。
