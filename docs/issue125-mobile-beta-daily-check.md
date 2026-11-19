# #125 消费改删、资料编辑、统计图与扫码交互当天核对、PR #131 书面复核及组外实测候选安排

2026-11-18（Beta 冲刺第 3 天）。本记录对应 [#125](https://github.com/Liangbai2333/tongzhang/issues/125)，协助闭环 `B06`、`B07`、`B08`（[#121](https://github.com/Liangbai2333/tongzhang/issues/121) / [PR #131](https://github.com/Liangbai2333/tongzhang/pull/131) 等，合计 20 点）并衔接 Day 6 `B18` / `B19` 组外真实用户调查准备。

> **措辞与验收口径声明**：按 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律，本文客户端检查严格属于 **Beta Day 3 当天核对**，用于验证 `B07`、`B08` 合入主线并在新构建开发客户端中的实际交互、受控错误提示与写操作六格状态表合规性，**不等同于明日 Day 4（2026-11-19）中期干净环境独立安装正式验收**（`B12`）或 Day 7 最终候选交付验收。本单作为当天核对支撑交付，不额外增加或提前扣减总点数。

---

## 1. 新构建 Android 客户端当天核对

### 1.1 客户端构建归属与运行环境

- **服务端、Metro JS 与原生客户端新构建提交号**：**新构建提交号 `9cbe6ba`**（完整提交 `9cbe6bacdce8ee130d3103b6ed2246b6b4456831`，已包含 `B07` / `B08` 移动端全部功能与 `expo-camera`、`react-native-svg` 原生配置）。
- **构建方式与 APK SHA-256**：在独立工作树执行 `pnpm install --frozen-lockfile`、`pnpm build:shared`、`cd apps/mobile && pnpm exec expo prebuild --platform android --no-install` 与 `cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4`（475 tasks，`57s` 编译成功）；卸载旧包后全新安装至 Android 17 模拟器，宿主机 `app-debug.apk` 与设备内 `/data/app/.../com.tongzhang.app.../base.apk` 的 SHA-256 完全一致：

```text
ca9c42ca2bf7ee572080be153264e4e07824c37b4573e8c06853544a7112f8b5
```

- **权限清单核对**：Prebuild 生成的 `AndroidManifest.xml` 正确包含 `android.permission.CAMERA` 并以 `tools:node="remove"` 移除 `android.permission.RECORD_AUDIO`（无多余录音权限）。
- **隔离运行环境**：
  - Android 17（API 37 / `arm64-v8a` / `1080 × 2400`）模拟器 `Medium_Phone_API_37.0`（`emulator-5554`，`-no-snapshot-load -no-snapshot-save -gpu swiftshader_indirect`）。
  - 独立 PostgreSQL 17 容器库 `beta125`（`127.0.0.1:35525`，执行 `pnpm migrate:db` 初始化 15 张表）。
  - 本机真实 Fastify API 监听 `127.0.0.1:3375`，Metro 开发服务监听 `8075`（`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3375`），通过 `adb -s emulator-5554 reverse tcp:3375 tcp:3375` 与 `tcp:8075 tcp:8075` 互联。
  - 完整哈希、Manifest 摘录及期末 PostgreSQL 快照见 [runtime-checks.txt](evidence/issue125-mobile-beta-daily-check/runtime-checks.txt)。

### 1.2 四大模块当天核对结果与真实运行截图

测试账号为隔离库 `beta125` 真实注册账号：`小安`（`an@beta125.test`，账本创建者）与 `小白`（`bai@beta125.test`，普通成员，核对中改名为 `XiaoBai25`）；测试账本为 `鼓山周末行`（`8e265a45-1020-42d9-89e0-097a8ef11085`，邀请码 `8SWU9A`）与 `空账本统计核对`（`6d2c9603-8f1c-4c23-b3b2-2a52ace316e9`）。

| 核对模块                                                       | 实操路径与边界场景                                                                                                                                                                                                                                                                                                                                                                                         | 实际结果与原始运行截图                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. 应用内扫码加入与相机拒权回退**（`B07`）                   | `小白` 打开「+」→「加入账本」核对「6 位邀请码」与「扫码加入」入口 → 首次点击「扫码加入」在系统权限弹窗点 `Don’t allow` → 再次点击并再次拒绝触发永久拒权（`canAskAgain: false`）→ 授予相机权限打开 `QrScannerSheet` 扫码框 → 切回手输 `8SWU9A` 预览并加入 `鼓山周末行`。                                                                                                                                    | **通过**。首次拒权留在当前手输页，内联显示「未获得相机权限，请直接在上方输入 6 位邀请码加入。」，无白屏/闪退；永久拒权额外展示「前往系统设置开启相机」按钮；授权后正常打开后置相机扫码框；手输回退预览确认加入后成功进入 2 人账本。[扫码入口 01](evidence/issue125-mobile-beta-daily-check/01-join-ledger-qr-entry.png) · [相机权限弹窗 02](evidence/issue125-mobile-beta-daily-check/02-camera-permission-prompt.png) · [首次拒权回退 03](evidence/issue125-mobile-beta-daily-check/03-camera-denied-once-fallback.png) · [永久拒权设置入口 04](evidence/issue125-mobile-beta-daily-check/04-camera-denied-permanent-settings.png) · [扫码面板开启 05](evidence/issue125-mobile-beta-daily-check/05-qr-scanner-camera-open.png) · [手输回退预览 06](evidence/issue125-mobile-beta-daily-check/06-fallback-manual-join-preview.png) · [加入成功 07](evidence/issue125-mobile-beta-daily-check/07-joined-gushan-ledger.png)                                                                                                                                                                                                                |
| **2. SVG 多维支出统计图表**（`B08` / `A21`）                   | 先在 0 消费态点击「支出统计」核对空态渲染；随后录入 4 笔跨 4 类（住宿 `¥180.00`、餐饮 `¥120.00`、门票 `¥80.00`、交通 `¥60.00`）跨 3 日（`11-16` / `11-17` / `11-18`）合计 `¥440.00` 消费，再次进入「支出统计」并滚动核对全部四组图表与榜单。                                                                                                                                                               | **通过**。空账本展示 `EmptyState` 空态且无除零/`NaN` 异常；非空账本完整渲染总支出卡、分类占比 SVG 环形图（40.9% / 27.3% / 18.2% / 13.6%）、按日消费趋势 SVG 柱状图（3 天柱高与标签清晰）、单笔支出排行及成员已付/应摊对比条形图。[统计空态 08](evidence/issue125-mobile-beta-daily-check/08-statistics-empty-state.png) · [环形图与按日趋势 09](evidence/issue125-mobile-beta-daily-check/09-statistics-donut-trend.png) · [单笔排行与成员对比 10](evidence/issue125-mobile-beta-daily-check/10-statistics-rank-members.png)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **3. 消费编辑、软删除与冲突/冻结提示**（`B07` / `A16`、`A17`） | 打开 `小白` 记录的「鼓山半山茶室」（`¥120.00`）核对底部操作按钮 → 编辑金额为 `¥150.00` 并保存 → 再次打开编辑态后由 `小安` 并发 `PATCH` 至 `¥160.00`（`version = 4`），客户端提交旧版本触发 `409 VERSION_CONFLICT` 并点显式刷新恢复 → 软删除「涌泉寺门票」（`¥80.00`）核对总额降为 `¥400.00` → 打开消费详情期间由 `小安` 冻结账本进入 `SETTLING`，尝试删除触发 `409 LEDGER_FROZEN` 并点显式刷新转为只读态。 | **通过**。编辑保存后实时刷新为 `¥150.00`（两人各 `¥75.00`）；`409 VERSION_CONFLICT` 内联提示「消费记录已在其他设备或会话中更新，请刷新最新内容后再操作。」并给出「刷新最新消费」按钮（无自动重试），点刷新即同步至 `¥160.00`；软删除经二次确认后准确扣除金额；`409 LEDGER_FROZEN` 内联提示「账本已进入结算或结清状态，消费已冻结，无法继续编辑或删除。」并给出「刷新账本状态」按钮，刷新后底部编辑/删除入口立即隐藏。[详情可编辑态 11](evidence/issue125-mobile-beta-daily-check/11-expense-detail-can-edit.png) · [编辑保存成功 12](evidence/issue125-mobile-beta-daily-check/12-expense-edit-saved.png) · [409 版本冲突提示 13](evidence/issue125-mobile-beta-daily-check/13-expense-edit-version-conflict.png) · [软删除二次确认 14](evidence/issue125-mobile-beta-daily-check/14-expense-delete-confirm-sheet.png) · [删除后总额更新 15](evidence/issue125-mobile-beta-daily-check/15-expense-deleted-ledger-updated.png) · [409 账本冻结提示 16](evidence/issue125-mobile-beta-daily-check/16-expense-delete-ledger-frozen.png) · [刷新后只读态 17](evidence/issue125-mobile-beta-daily-check/17-expense-detail-frozen-readonly.png) |
| **4. 个人中心用户名与通知偏好修改**（`B08` / `A28`、`A29`）    | 切至底部「我的」标签 → 打开「账户信息」核对邮箱 `bai@beta125.test` 只读提示，将用户名由 `小白` 修改为 `XiaoBai25` 并点「保存用户名」→ 打开「设置」切换「通知开关」（开启 → 关闭）→ 返回「我的」主页并核对 PostgreSQL `users` 表持久状态。                                                                                                                                                                  | **通过**。用户名保存后立即展示绿字提示「用户名已更新，账本成员展示将同步刷新。」，邮箱保持只读；通知开关切换后立即更新为「已关闭站内提醒通知」；返回「我的」页顶部资料卡与设置项同步显示 `XiaoBai25` 与 `通知已关闭`，数据库 `users.username = 'XiaoBai25'`、`notification_enabled = f` 持久化一致。[用户名已更新 18](evidence/issue125-mobile-beta-daily-check/18-profile-username-updated.png) · [通知开关已关闭 19](evidence/issue125-mobile-beta-daily-check/19-profile-notification-toggled.png) · [我的主页同步刷新 20](evidence/issue125-mobile-beta-daily-check/20-account-tab-synced.png)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 2. 作为第二审查人对 `B07`、`B08`（[PR #131](https://github.com/Liangbai2333/tongzhang/pull/131)）的书面核对意见

已在 [PR #131 评论 #7011178457](https://github.com/Liangbai2333/tongzhang/pull/131#issuecomment-7011178457) 留下正式书面复核意见，对照 [code-standards.md](code-standards.md) 写操作六格状态表与本次 Android 实操结果逐项确认：

1. **消费编辑与软删除（`ExpenseForm.tsx`、`ExpenseDetailScreen.tsx`）**
   - 仅当服务端返回 `expense.canEdit === true` 时展示底部「编辑消费」「删除消费」按钮；进入编辑态先核验账本状态，非 `ACTIVE` 直接阻断并提示「账本已冻结」。
   - `PATCH` 与 `DELETE` 均经 `useIdempotentWrite` 管理状态与 `Idempotency-Key`：提交中禁用返回手势、按钮与表单输入；发生 `409 VERSION_CONFLICT` / `409 LEDGER_FROZEN` 时展示清晰受控文案与显式刷新按钮；网络中断进入 `uncertain` 态后**绝不自动重试**，保留草稿/原幂等键，由用户显式点「重试保存 / 重试删除」或「回到账本查看」。
2. **应用内扫码加入与拒权回退（`JoinLedgerScreen.tsx`、`QrScannerSheet.tsx`）**
   - 拒绝相机权限后停留在手输页并内联提示，永久拒权补充 `Linking.openSettings()` 系统设置入口，手输邀请码与预览流程不受阻断。
   - `QrScannerSheet` 使用 `locked` 引用防单帧重复触发，非法二维码内联提示并提供「重新扫描」「改用手输邀请码」双出口；确认加入沿用 `useIdempotentWrite`，无自动重试。
3. **个人中心资料与通知偏好（`AccountScreen.tsx`）**
   - 用户名按 Unicode 码点校验 `2～30` 字符并禁止 `\0`，邮箱保持只读；保存用户名与切换通知 `Switch` 分别通过 `profileLocked` / `prefLocked` 及 `disabled={busy}` 防重入，失败直接通过 `InlineError` 反馈且**不自动重试**；成功后调用 `syncUser` 并失效 `['user', user.id]` 查询缓存。
4. **多维支出统计图表（`StatisticsScreen.tsx`、`StatisticsCharts.tsx`）**
   - `centsRatio` 使用 `BigInt` 整数缩放（`10000n`），对 `totalCents <= 0n` 直接返回 `0`，彻底规避除零与 `NaN`；空账本渲染 `EmptyState`；金额展示全部经 `@tongzhang/domain` 整数分格式化，无浮点金额运算。

---

## 3. 组外真实用户调查（≥ 12 人）候选同学安排（衔接 `B18` / `B19`）

为保障 Day 6（2026-11-21）`B18` 多账号全链路实测与 `B19` 组外真实用户使用调查按期回收有效数据，已在 Day 3 落实组外候选同学分组排期与实测方案：

### 3.1 候选规模与分组排期（目标回收 ≥ 12 份有效样本，预留 15 人防爽约）

| 批次     | 候选来源（均非本小组成员）    |  拟邀人数 | 预计体验时段         | 重点体验场景                                                                         | 负责对接 |
| -------- | ----------------------------- | --------: | -------------------- | ------------------------------------------------------------------------------------ | -------- |
| 第 1 批  | 同年级软件工程相邻班级同学    |      5 人 | Day 5 晚（11-20 晚） | 4 人组队完成「鼓山一日」完整记账 → 消费编辑/删除 → 统计查看 → 冻结结算 → 归档        | 陈林祺   |
| 第 2 批  | 同宿舍楼/社团熟人（非同组）   |      5 人 | Day 6 上午（11-21）  | 应用内扫码加入 + 拒权手输回退、修改用户名与通知开关、AI 辅助记账草稿核对（若已开放） | 陈林祺   |
| 第 3 批  | 跨专业本科生/日常拼餐高频用户 |      5 人 | Day 6 下午（11-21）  | 陌生用户首次安装上手测试（仅看首屏与引导，不口头提示），收集界面理解与文案歧义点     | 陈林祺   |
| **合计** | **3 个独立群体（组外）**      | **15 人** | **Day 5 晚 – Day 6** | **确保 ≥ 12 人完成完整任务并提交结构化反馈问卷与匿名体验记录**                       | —        |

### 3.2 实测纪律与数据隔离约定

1. **账号与数据隔离**：组内 4 个基准验收测试账号（`小安`/`小白`/`小陈`/`小丁`）不计入 ≥ 12 人组外用户统计；组外同学使用独立测试邮箱或临时别名注册，不录入真实敏感银行卡/个人隐私信息。
2. **安装包口径一致**：待 Day 4 中期独立安装验收与 Day 5–6 线上 HTTPS 服务就绪后，统一分发带有明确提交号与 SHA-256 校验记录的 Beta Android APK，记录每批次使用的版本号与设备型号。
3. **问卷与访谈维度**（将在 `B19` 汇总报告中量化呈现）：
   - 首次上手耗时与核心任务一次完成率（注册加入、记一笔/改删、看懂统计图与结算转账方案）。
   - 异常提示清晰度评分（相机拒权提示、版本冲突/冻结提示、断网恢复提示）。
   - 最有帮助的功能排序、最容易困惑的 1～2 处交互细节及后续改进建议。
