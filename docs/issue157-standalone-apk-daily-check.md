# #157 脱离 Metro 独立 APK 安装与包体哈希当天核对及首批组外调查准备

2026-11-20（Beta 冲刺第 5 天 · 功能冻结日）。本记录对应 [#157](https://github.com/Liangbai2333/tongzhang/issues/157)，由詹铖煜（`@sunny-light233`）执行 `#153` 产出的独立 Release Android APK（`dist/android/tongzhang-e09353c-standalone.apk`）与 `#166`（`B16`）安装说明的独立环境**当天核对**，并配合陈林祺（`@lllin7`）完成第 1 批非本组同学实操观察模板、包体发放校验说明与三格反馈原话记录准备；第二审查人为陈林祺（`@lllin7`）、李润君（`@range-e`）。

> **措辞、范围与点数口径声明**（严格遵守 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律）：
>
> 1. **严格区分「当天核对」与「正式验收」**：本单属于独立环境**当天核对**，**不称**「正式验收」（Day 4 `B12` 为第一次正式验收，Day 7 `B21` 才称第二次正式验收）。
> 2. **如实记录公网 HTTPS 连通顺延**：本次仅核对脱离本机 Metro 与 `adb reverse` 的独立 APK 校验、安装、宿主机与设备 `base.apk` SHA-256 一致性及离线冷启动直达欢迎页无红屏；**公网 HTTPS 连通核对（`/health/ready = 200` 及线上真实注册/读写）随 `B14` 顺延至明日 Day 6（2026-11-21）补齐**，严禁将离线冷启动或本地联调表述为线上 HTTPS 已连通。
> 3. **严格区分「验收账号」与「组外真实同学」**：本单第 3 节准备的第 1 批实操观察与三格反馈表仅面向非本小组成员的真实同学，不与 `B18` 四个验收账号混计。
> 4. **点数核销口径**：本单配合核对 `#153` 独立 APK 构建产物与闭环 `B16`（`8` 点，计入袁湘湘名下）；前置预检 `B14`（`6` 点，顺延至 2026-11-21 核销）与 `B21`（整项 `4` 点，计划 2026-11-22 完成），**今日不重复估点，不提前扣减 `B14`、`B21` 整项点数**。

---

## 1. 脱离 Metro 独立 Release Android APK 当天核对记录

严格依据 [app-user-guide.md（独立 Android APK 下载校验与安装）](app-user-guide.md#独立-android-apk-下载校验与安装) 对 `e09353c` 产出的 `dist/android/tongzhang-e09353c-standalone.apk` 与 `dist/android/SHA256SUMS.txt` 执行独立环境当天核对：

| 版本      | 环境 | 步骤                                                                                                                                                                           | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e09353c` | S1   | 按交付说明在宿主机执行 `cd dist/android && shasum -a 256 -c SHA256SUMS.txt`，并用 `aapt2 dump badging`、`unzip -l` 核对包体元数据、内嵌 JS Bundle 与权限声明。                 | **通过**。`shasum -a 256 -c SHA256SUMS.txt` 输出 `tongzhang-e09353c-standalone.apk: OK`（文件大小 `136,831,819` 字节，SHA-256 为 `4e844e5a985af0e5db0a52ebc35fbb8850cbb63d741c743a11739b26d897a241`）；包名 `com.tongzhang.app`、`versionName=0.1.0`、`minSdk=24`、`targetSdk=36`，内嵌 `assets/index.android.bundle`（`4,023,060` 字节），仅含 `CAMERA` 无 `RECORD_AUDIO`。                                                         |
| `e09353c` | S1   | 启动全新空白隔离 AVD `Beta157`（`emulator-5584`，`-no-snapshot -wipe-data -gpu swiftshader_indirect`），确认不启动本机 Metro（`8081`）、本机 API（`3300`）与 `adb reverse`。   | **通过**。启动前核验 `lsof -i :8081 -i :3300` 无任何进程监听、`adb -s emulator-5584 reverse --list` 为空、`pm path com.tongzhang.app` 为未安装状态；系统属性确认 Android `17`（API `37`、`arm64-v8a`）。                                                                                                                                                                                                                             |
| `e09353c` | S1   | 按交付说明执行 `adb -s emulator-5584 install -r dist/android/tongzhang-e09353c-standalone.apk`，并提取设备内 `base.apk` 路径计算 SHA-256 与宿主机逐位比对。                    | **通过**。返回 `Performing Streamed Install` → `Success`；设备内 `base.apk` 与宿主机 APK 的 SHA-256 均为 `4e844e5a985af0e5db0a52ebc35fbb8850cbb63d741c743a11739b26d897a241`，完全一致。                                                                                                                                                                                                                                              |
| `e09353c` | S1   | 在保持无 Metro、无 `adb reverse` 状态下执行 `adb -s emulator-5584 shell am start -W -n com.tongzhang.app/.MainActivity` 冷启动，采集截图与 logcat，并点按「已有账号？ 登录」。 | **通过**。`Status: ok`、`LaunchState: COLD`、`TotalTime: 5085ms`，脱离 Metro 直达「同账 TongZhang」欢迎页（插画、「开始使用」与「已有账号？ 登录」完整渲染），无红屏、无白屏、无崩溃；点击「已有账号？ 登录」顺利进入登录页。[离线冷启动欢迎页 01](evidence/issue157-standalone-apk-daily-check/01-standalone-cold-start-welcome.png) · [登录页渲染 02](evidence/issue157-standalone-apk-daily-check/02-standalone-login-screen.png) |
| `e09353c` | —    | 公网 HTTPS 连通核对（验证线上 `/health/ready = 200` 及独立 APK 直连公网 HTTPS API 完成注册/登录与账本读写）。                                                                  | **顺延至 Day 6（随 `B14` 补齐）**。当前未执行真实云端 HTTPS 部署与公网连通核对，严禁将上方离线冷启动结果表述为线上 HTTPS 已连通。                                                                                                                                                                                                                                                                                                    |

### 1.1 环境 S1 与宿主机 / 设备 `base.apk` SHA-256 对照

- **核对产物**：`dist/android/tongzhang-e09353c-standalone.apk`（`136,831,819` 字节）与同目录 `dist/android/SHA256SUMS.txt`（`99` 字节），归属提交 `e09353c`。
- **宿主机 APK 与设备内 `base.apk` SHA-256（逐位一致）**：

```text
4e844e5a985af0e5db0a52ebc35fbb8850cbb63d741c743a11739b26d897a241
```

- **独立核对环境 S1**：
  - 独立工作树：`/Users/liangbai/Homework/tongzhang-157-standalone-apk-check`（自最新 `origin/main` `e09353c` 检出）。
  - 隔离模拟器：新建临时 AVD `Beta157`（`emulator-5584`，`-no-snapshot -wipe-data -gpu swiftshader_indirect`，Android 17 / API 37、`arm64-v8a`、`1080 × 2400`，核对结束后已停止并删除临时 AVD）。
  - 网络与进程隔离：全程未启动 Metro（`8081` 空闲）、未启动本机 Fastify API（`3300` 空闲）、未配置任何 `adb reverse` 转发规则。

---

## 2. 原始日志文件名、截图清单与 PR 书面审查批注

### 2.1 归档日志与截图清单

全部原始日志与真实截图归档于 [docs/evidence/issue157-standalone-apk-daily-check/](evidence/issue157-standalone-apk-daily-check/)：

| 类别     | 文件名                                                                                                                    | 内容摘要                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 校验日志 | [host-sha256-verify.txt](evidence/issue157-standalone-apk-daily-check/host-sha256-verify.txt)                             | 宿主机 `shasum -a 256 -c SHA256SUMS.txt` 返回 `OK`，核对文件大小 `136,831,819` 字节与 64 位小写哈希                                 |
| 包体日志 | [apk-metadata-check.txt](evidence/issue157-standalone-apk-daily-check/apk-metadata-check.txt)                             | `aapt2 dump badging` 与 `unzip -l` 输出，确认 `com.tongzhang.app`、内嵌 `assets/index.android.bundle`（`4,023,060` 字节）及权限清单 |
| 安装日志 | [adb-install-and-hash-verify.txt](evidence/issue157-standalone-apk-daily-check/adb-install-and-hash-verify.txt)           | 安装前 `8081`/`3300` 空闲与 `adb reverse --list` 为空、`adb install -r` 成功，宿主机与设备 `base.apk` SHA-256 一致                  |
| 启动日志 | [cold-start-launch.txt](evidence/issue157-standalone-apk-daily-check/cold-start-launch.txt)                               | `am start -W -n com.tongzhang.app/.MainActivity` 返回 `Status: ok`、`LaunchState: COLD`、`TotalTime: 5085ms`                        |
| 运行日志 | [cold-start-runtime-log.txt](evidence/issue157-standalone-apk-daily-check/cold-start-runtime-log.txt)                     | 进程存活（`pidof`）、前台 `topResumedActivity` 及 `logcat` 摘录（无红屏、无 `FATAL`/未捕获异常）                                    |
| 运行截图 | [01-standalone-cold-start-welcome.png](evidence/issue157-standalone-apk-daily-check/01-standalone-cold-start-welcome.png) | `1080 × 2400` PNG：脱离 Metro 与 `adb reverse` 冷启动直达「同账 TongZhang」欢迎页                                                   |
| 运行截图 | [02-standalone-login-screen.png](evidence/issue157-standalone-apk-daily-check/02-standalone-login-screen.png)             | `1080 × 2400` PNG：点击「已有账号？ 登录」进入登录页，校验内嵌 JS Bundle 路由跳转与表单渲染正常                                     |

### 2.2 在 `#161` 与 `#166` 留下的具体书面审查批注

- **PR #161（`B13` / `#153`）**：[独立环境当天核对书面审查批注（#157）](https://github.com/Liangbai2333/tongzhang/pull/161#issuecomment-7063872824)
- **PR #166（`B16` / `#160`）**：[按交付说明独立安装与第一屏核对书面审查批注（#157）](https://github.com/Liangbai2333/tongzhang/pull/166#issuecomment-7063873825)

---

## 3. 配合陈林祺完成第 1 批非本组同学实操观察与包体发放准备

本节衔接 [issue142-b12-review-and-b18-b19-prep.md（B19 组外调查安排）](issue142-b12-review-and-b18-b19-prep.md#3-b19-前置准备组外-12-名真实同学实操调查安排与三格回收台账)，落实第 1 批（同年级软件工程相邻班级，拟邀 `5` 人，保底有效回收 `≥ 4` 人）的包体发放校验说明、实操观察模板与三格反馈原话记录表。

### 3.1 第 1 批包体发放与校验说明（发放前必核）

> **发放门禁**：第 1 批组外同学实操须在 **Day 6 `B14` 公网 HTTPS 服务 `/health/ready = 200` 连通核对通过后**正式发放；若 Day 6 替换线上域名后重新打包，须同步更新下表中的短哈希与 `SHA256SUMS.txt`，严禁发放未校验或哈希不一致的 APK。

- **当前冻结基线包体**：`tongzhang-e09353c-standalone.apk`（`136,831,819` 字节）与同目录 `SHA256SUMS.txt`
- **当前基线 SHA-256**：`4e844e5a985af0e5db0a52ebc35fbb8850cbb63d741c743a11739b26d897a241`
- **发放前由组织人（陈林祺 / 詹铖煜）先核对哈希**：
  - macOS：`shasum -a 256 -c SHA256SUMS.txt` → 确认输出 `tongzhang-<shortSha>-standalone.apk: OK`
  - Linux：`sha256sum -c SHA256SUMS.txt` → 确认输出 `tongzhang-<shortSha>-standalone.apk: OK`
  - Windows PowerShell：`(Get-FileHash .\tongzhang-<shortSha>-standalone.apk -Algorithm SHA256).Hash.ToLower()` → 逐位核对 `SHA256SUMS.txt`
- **同学手机安装指引（直接摘自 [app-user-guide.md](app-user-guide.md#独立-android-apk-下载校验与安装)）**：
  1. 仅向同学提供本包体与同版本操作手册摘要，**不要求**同学安装 Node/Expo/Android Studio，也无需电脑连线。
  2. Android 真机点击已校验的 APK，按系统提示开启「允许安装未知来源应用」后完成安装并直接打开；若手机曾装过不同签名的旧测试包导致安装失败，先卸载旧版「同账」再重装。
  3. 打开后直达欢迎页，由同学自行注册新账号并走完指定任务；若遇到网络报错，先核对手机网络与线上服务状态，如实记录报错现象而不代为操作。

### 3.2 第 1 批实操观察模板与现场记录分工

- **组织与分工**：陈林祺（`@lllin7`）主责第 1 批同学联络、任务卡片发放与汇总；詹铖煜（`@sunny-light233`）协助发放前包体哈希核验、安装排障记录与现场原话速记。
- **第 1 批核心观察任务（不口头剧透，仅给交付说明）**：
  1. **安装与首次启动**：按说明完成安装并冷启动进入欢迎页（观察是否在未知来源权限、登录/注册入口文案处停顿）。
  2. **注册与建账 / 扫码加入**：完成注册登录、创建账本或扫码/手输 6 位邀请码加入（观察相机拒权回退与 6 格码框交互是否顺畅）。
  3. **记账、改删与统计图**：新增消费、编辑/软删除消费并查看支出统计图（观察分摊切换、整数金额输入与图表理解是否存在歧义）。
  4. **结算冻结与登记已还**：预览结算、发起冻结、登记已还或查看站内提醒（观察「预览不冻结」与「已还不改消费」文案是否清晰）。
- **现场记录四条纪律**：
  1. **不提前口头引导**：遇阻先原样记下卡在哪句说明或哪个按钮，再给最小化提示。
  2. **匿名脱敏红线**：三格表只记反馈原话，**严禁记录姓名、学号、真实邮箱/账号或联系方式**。
  3. **口径分离**：第 1 批仅统计非本小组成员，**绝不混入** `B18` 四个验收账号。
  4. **三分类分流**：发现的高优阻碍归入 `缺陷` 进入 `B20` 修复复测（不加点）；非本轮范围建议归入 `推迟` 记入 [known-limitations.md](known-limitations.md)。

### 3.3 第 1 批非本组同学三格反馈原话记录表（现场直接填写）

严格沿用 [beta-external-user-observation-template.md](beta-external-user-observation-template.md) 的标准三格结构（每人一行，仅记反馈不记身份；前两栏顺利填「未卡」，第三栏记「愿意 / 不愿意 / 未回答」并保留原因原话；回收后并入 [issue142 总台账](issue142-b12-review-and-b18-b19-prep.md#33-组外-12-人三格回收台账模板现场直接填写)）：

| 卡在哪句说明 | 卡在哪个按钮 | 是否愿意再用 |
| ------------ | ------------ | ------------ |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |

- **第 1 批回收核对预留（Day 6 现场回收后据实填入）**：
  - 实际发放 APK 版本与 SHA-256：`________________`
  - 有效回收份数：`__ / 5`（保底目标 `≥ 4` 份，均非本小组成员）
  - 汇总入 `B19` 总台账日期与核对人：`2026-11-21` / 陈林祺、詹铖煜

---

## 4. 本单验证记录（四层分列口径）

本单（`#157`）仅新增当天核对报告、真实运行截图与原始日志，未修改任何业务源码、数据库 Schema、迁移脚本、接口契约或原生依赖：

- **静态检查与格式化（`pnpm check`）**：在独立工作树 `/Users/liangbai/Homework/tongzhang-157-standalone-apk-check`（基于 `origin/main` `e09353c`）执行 `pnpm check`（含 `build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .`），全部通过。
- **文档链接与证据核对**：核验本报告内全部本地相对链接与锚点、2 张 `1080 × 2400` PNG 原图及 5 份原始日志文件均存在且非空，失效路径 `0` 条。
- **第 1 层（无数据库测试 `pnpm test`） / 第 2 层（移动端组件测试 `pnpm test:mobile`） / 第 3 层（真实 PostgreSQL 集成测试）**：本单未修改业务源码、契约或数据库逻辑，未重跑上述自动化测试套件。
- **第 4 层（原生独立 APK 当天核对状态）**：已在空白隔离 AVD `Beta157`（Android 17 / API 37、`arm64-v8a`、无 Metro、无 `adb reverse`）完成 `dist/android/tongzhang-e09353c-standalone.apk` 的 `SHA256SUMS.txt` 校验、`adb install -r` 安装、宿主机与设备 `base.apk` SHA-256 比对（`4e844e5a985af0e5db0a52ebc35fbb8850cbb63d741c743a11739b26d897a241`）及脱离 Metro 冷启动直达欢迎页无红屏核对；公网 HTTPS 连通核对随 `B14` 顺延至 Day 6 补齐，第二次正式验收由 Day 7 `B21` 执行。
