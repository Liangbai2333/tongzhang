# Day7 最终原生验收与交付

2026-10-29。对应 #68、#72、#74、#75。任务负责人保持原分工，本轮由系统架构账号统一补齐实操和材料，不代称其他成员亲自操作。

## 固定交付版本

- **原生验收与交付源码：`df4d773c8d724b0cf453b0baa0764f6871f1a103`。** 独立工作目录从该提交检出，安装与运行时已跟踪产品文件无差异，见 [源状态](evidence/day7-delivery/runtime-source-status.txt)。
- 实操期间主线继续开发并合入 #83（`1d1ebcc`）。本交付包固定上述已验收版本，不将 #83 或后续工程细化自动算作已原生验收；本资料 PR 仅追加文档、证据，保留后续代码。
- 该版本的 [CI](https://github.com/Liangbai2333/tongzhang/actions/runs/40861263588) 全部通过；同运行源码的无数据库125、移动端250、真实数据库136项回归输出见 [Day7首次复核](day7-final-review.md)。移动端 Jest 两个平台项目不等同 iOS 原生验收。

## 可下载的交付物

[Alpha Day7 开发验收包](https://github.com/Liangbai2333/tongzhang/releases/tag/alpha-day7-20261029) 已发布为 prerelease，提供：

| 文件                                | 用途                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `tongzhang-Day7-arm64-debug.apk`    | 本轮从源码重新构建的 ARM64 Android 开发客户端，99,547,334 字节      |
| `tongzhang-Day7-source-df4d773.zip` | 固定提交的已跟踪源码快照，不含本地 `.env`、依赖目录及用户未提交文件 |
| `SHA256SUMS.txt`                    | APK 与源码 ZIP 的完整性校验                                         |
| `README-Day7.md`                    | 环境、安装、API/Metro启动、端口转发与重建步骤                       |

APK SHA-256：`44032027a84452e3b5485e95acba0e656f335686fb32f49483aad55dc9112f91`。设备安装后的 `base.apk` 哈希与本地产物、GitHub 上传端摘要一致，见 [设备校验](evidence/day7-delivery/installed-apk-sha256.txt)、[服务端上传摘要](evidence/day7-delivery/release-verification.json)、[debug签名](evidence/day7-delivery/apk-signature.txt)。

**这是开发客户端，必须连接同版本 API 和 Metro，不是独立离线 App 或生产签名发布包。** 未声明物理真机、iOS完整主链、成功拍照、生产部署通过。相机拒权、相册选择/取消均为本轮实际验证。

## 环境、构建与安装

使用独立目录 `/tmp/tongzhang-day7-acceptance`、独立 `Tongzhang_Day7` AVD，以及新建 PostgreSQL 17 容器 `tongzhang-day7-acceptance-db` / `tongzhang_day7_native` 数据库。没有迁移、清空或修改开发库。独立实例中途退出一次，恢复为另一端口；序列号5556→5580，同一AVD，未保存表单重新填写，已保存数据仍在服务器。

Android 17/API37 ARM64，1080×2400；Node24、pnpm12.6.0、JDK17、Expo57。先安装冻结依赖、编译服务端、在空库执行迁移；通过 Expo Prebuild 生成原生工程，未手工修改生成源码。实际构建：

```sh
# apps/mobile
pnpm exec expo prebuild --platform android
# apps/mobile/android；JAVA_HOME指定JDK17，ANDROID_HOME指定SDK
./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4
```

第一次因临时目录未继承 SDK 路径失败；第二次因默认 JDK25 的 CMake 配置失败。显式指定 SDK/JDK17 后构建成功：475项任务，167执行、308缓存/已更新。保留 [首次失败](evidence/day7-delivery/build-first-missing-sdk.txt)、[第二次失败](evidence/day7-delivery/build-second-jdk25.txt)、[成功原始输出](evidence/day7-delivery/build-success.txt)，没有修改产品代码来绕过构建。

新AVD上 `adb install` 返回 Success，实际包信息见 [安装记录](evidence/day7-delivery/installed-package.txt)。运行 API入口3374、实际服务3375、Metro8074，经独立设备 reverse 连接；API入口为不改业务的测试转发层，只有指定 `/api/v1/me` 响应延迟8秒的探针。正常业务均由候选真实服务和 PostgreSQL 执行。重现时不需要探针，按下载页 README 直接使用3374和8074即可。安装包需在线API/数据库和Metro，不将JS打包当作原生安装。

## 本轮实际验收

使用API真实注册的 `day7owner`、`day7member` 两个测试账号，随后所有业务步骤由原生 App 操作。使用仓库图标作为明确的测试封面/收据媒体，验证选择、上传、权限和绑定；不把它描述为真实发票。人工已还登记是测试数据，不代表真实转账。

| 检查                | 实际结果                                                                                                                 | 原始截图                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新安装、真实登录    | 欢迎页正常，创建者登录读取空列表                                                                                         | [01](evidence/day7-delivery/01-fresh-installed-welcome.png)、[02](evidence/day7-delivery/02-owner-login-current-list.png)                                                                                                                                |
| 相册取消与建账      | 取消保留名称；再次选择自定义封面，真实上传并建账                                                                         | [03–06目录](evidence/day7-delivery/)、[06](evidence/day7-delivery/06-created-invitation.png)                                                                                                                                                             |
| 第二账号加入        | 使用实际邀请码预览并加入，两位成员                                                                                       | [10](evidence/day7-delivery/10-member-join-preview.png)、[11](evidence/day7-delivery/11-member-joined.png)                                                                                                                                               |
| 消费/相机拒权/收据  | 120元，两人各60；拒绝相机保留输入，可改从相册选择收据                                                                    | [12](evidence/day7-delivery/12-expense-120-split.png)、[13](evidence/day7-delivery/13-camera-permission.png)、[14](evidence/day7-delivery/14-camera-denied-keeps-form.png)、[15](evidence/day7-delivery/15-selected-receipt.png)                         |
| 真实401、同账号恢复 | 独立库撤销当前会话，保存收到真实401；重新登录并在线核验后原金额/标题/收据选择保留，不自动提交                            | [16](evidence/day7-delivery/16-real-401-gate.png)、[20](evidence/day7-delivery/20-same-account-retained-receipt.png)                                                                                                                                     |
| 断网与迟到200       | 登录核验时真实GET me响应延迟8秒，关闭设备Wi-Fi与数据；迟到200不解锁，恢复网络也不解锁，再显式登录核验才恢复；期间消费数0 | [17](evidence/day7-delivery/17-network-lost-during-verification.png)、[18](evidence/day7-delivery/18-late-200-still-gated.png)、[19](evidence/day7-delivery/19-network-restored-still-gated.png)、[SQL](evidence/day7-delivery/no-write-during-gate.txt) |
| 保存及授权图片      | 手动保存后只有一笔12000分消费、两条6000分分摊，收据成员读取成功                                                          | [21](evidence/day7-delivery/21-expense-saved-once.png)、[22](evidence/day7-delivery/22-authorized-receipt.png)                                                                                                                                           |
| 余额与只读预览      | 创建者待付60，成员待收60；普通成员不能正式冻结；预览后仍ACTIVE且批次数0                                                  | [23](evidence/day7-delivery/23-balances-60.png)、[24](evidence/day7-delivery/24-member-readonly-preview.png)、[SQL](evidence/day7-delivery/preview-does-not-freeze.txt)                                                                                  |
| 换账号清除          | 未保存的1元/NeverTransferDay7表单遇401，改用创建者登录，表单金额和标题清空、付款人切换，数据库无该消费                   | [25](evidence/day7-delivery/25-other-account-unsaved-form.png)、[26](evidence/day7-delivery/26-different-account-cleared-form.png)、[SQL](evidence/day7-delivery/different-account-no-write.txt)                                                         |
| 正式冻结            | 创建者确认后SETTLING，保存一笔60元正式方案                                                                               | [27](evidence/day7-delivery/27-owner-preview.png)、[28](evidence/day7-delivery/28-freeze-confirm.png)、[29](evidence/day7-delivery/29-formal-pending-60.png)                                                                                             |
| 已还及整本结清      | 登记测试说明Day7-test-6000，1/1已还、待登记0，创建者确认后SETTLED/version5                                               | [30](evidence/day7-delivery/30-paid-confirm.png)、[31](evidence/day7-delivery/31-paid-zero-remaining.png)、[32](evidence/day7-delivery/32-close-confirm.png)、[33](evidence/day7-delivery/33-settled.png)                                                |
| 个人归档、历史只读  | 创建者当前列表移出，历史可读账目/收据/结算；财务快照逐字核对未变                                                         | [34–38目录](evidence/day7-delivery/)、[37](evidence/day7-delivery/37-history-readonly-ledger.png)、[38](evidence/day7-delivery/38-archived-authorized-receipt.png)                                                                                       |
| 其他成员隔离        | 成员当前列表仍有同一已结清账本，历史为空；SQL仅创建者archived为true                                                      | [39](evidence/day7-delivery/39-member-current-unaffected.png)、[40](evidence/day7-delivery/40-member-history-empty.png)、[SQL](evidence/day7-delivery/final-database.txt)                                                                                |
| 图标复核            | 新客户端列表、返回、个人中心、分类和弹层中的关键图标正常可见，未复现#80报告的偶现缺图；不声称已修复所有设备上的偶发问题  | [08](evidence/day7-delivery/08-profile-icons.png)、[21](evidence/day7-delivery/21-expense-saved-once.png)、[28](evidence/day7-delivery/28-freeze-confirm.png)                                                                                            |

USB reverse仍在，因此网络探针用于证明客户端“断网状态下拒绝迟到成功”的门禁，不等同物理弱网验收。探针只延迟真实服务结果，没有伪造401/200或业务响应。App进程重启丢弃未保存尝试属于既定范围，不把它当作已保存消费丢失。

## 数据、文档及证据核对

最终库：1账本、2成员、1消费12000分、2条分摊共12000分、1封面+1收据（各43952字节）、1收据绑定、1正式批次、1条6000分PAID转账；七类业务审计各一次。创建者归档，另一成员未归档；无NeverTransferDay7消费。

归档前后 [财务记录](evidence/day7-delivery/settled-before-archive.txt) 与 [归档后记录](evidence/day7-delivery/settled-after-archive.txt) 字节一致，已断言核对通过。见 [最终SQL](evidence/day7-delivery/final-database.txt)、[实际HTTP状态与8秒探针](evidence/day7-delivery/native-http.jsonl)。不发布密码、令牌、JWT密钥或.env。

[文档核对程序](evidence/day7-delivery/check-delivery.mjs) 将全部30项接口的方法/路径/成功码/认证/幂等及实际路由登记与接口索引比较，并检查139个既有本地文件链接，通过输出见 [audit](evidence/day7-delivery/document-audit.json)。安装步骤已按实际SDK/JDK问题补充；当前源码快照和开发客户端的依赖/启动要求均可下载。历史报告保留版本，不覆盖旧图。

40张截图均为设备原始1080×2400 PNG，不裁切、不生成替代运行图；顺序及SHA-256见 [manifest](evidence/day7-delivery/manifest.json)。验收环境已停止，未修改用户开发数据库或正在细化的工作区文件。

## Issue 完成与剩余量

| Issue     | 负责人 | 完成结论                                                             | 剩余量             |
| --------- | ------ | -------------------------------------------------------------------- | ------------------ |
| #72       | 陈林祺 | 本轮完整原生主路径、图片、401恢复/换账号、断网迟到响应及图标复核通过 | 不新增、不重复计点 |
| #74 / T17 | 高娅婷 | 新构建、新安装、完整路径、权限、哈希、可下载包与可复现启动步骤齐备   | 8→0                |
| #75 / T18 | 袁湘湘 | 操作、接口、已知限制与固定候选对应，最终产物及证据入口齐备           | 8→0                |
| #68       | 饶恩哲 | 确认固定交付候选、汇总证据和限制，资料经PR/CI后合入                  | 16→0               |

本次只核销已保留的T17/T18共16点，不增加新估算或重复扣已完成工作。关闭范围为此固定Day7交付候选；后续工程新提交按各自PR继续验证。资料PR的CI通过、审核并合入后，在四个Issue中附版本、下载和验证记录关闭。
