# Issue #61：Day6 候选文档走查与 Day7 交付准备

2026-10-28，关联 [#61](https://github.com/Liangbai2333/tongzhang/issues/61)。本次核对候选 `bade61230ee3434d5bba443a7e258289d1cec057`，更新[操作手册](app-user-guide.md)、[30 项接口索引](api-reference.md)、[已知限制](known-limitations.md)及 README/安装说明的当前入口；不改变业务实现，不重新开发已完成面板。使用已配置的 Liangbai2333 Git 身份，不冒用原负责人。文档 PR 待架构负责人审核，不合并、不更新冲刺完成状态，T18 整项 8 点保留到 Day7 最终候选验收。

## 候选与复用边界

已阅读 AGENTS、CONTRIBUTING、README、product-spec、architecture、相关模块、contracts、service、App feature 和原生交付记录。原工作区 `git fetch origin`、`git merge --ff-only origin/main` 后主线为 `bade612`；从 `origin/main` 新建 worktree `issue-61-candidate-docs/tongzhang`、分支 `docs/61-candidate-docs`。原工作区未跟踪的冲刺文档原样保留。

| 比较对象                            | 实际差异与证据采用规则                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #49 文档候选 `7616adb` → `bade612`  | contracts、domain、服务端实现与迁移无变化；移动端认证、导航、输入样式和请求准入变化，另有回归测试增补。因此不能整份照抄 #49 的 401 恢复说明                                            |
| Day6 完整主链 `89d0166` → `bade612` | 仅 `auth/controller.ts` 及其测试改变；完整封面/加入/收据/账务主链沿用 #58/#59 原实操。变化的断网迟到核验场景已在最终 `adff4d8` 重新原生操作，不能把 `89d0166` 主链截图当成该修复的验证 |
| Day6 最终源码 `adff4d8` → `bade612` | `apps packages pnpm-lock.yaml package.json scripts infra .github` 无差异；#60 的 `c954dda` 同样无运行时代码变化。#60 覆盖登录、冷启动、前后台、拒权/取消及恢复边界，继续有效           |
| 原生包来源 `2097271` → `bade612`    | mobile/package.json、锁文件、app.config.ts、plugins、assets 无差异，兼容 development 客户端的复用条件未变；本次未构建、安装或读取设备                                                  |

机器核对见 [audit.json](evidence/issue61/audit.json)：逐一重算 #49、#58/#59、#60 manifest 内附件哈希；将 #58/#59 和 #60 实际加载记录中的项目源码哈希与当前文件比较；重新执行既有只读 SQL/HTTP 证据断言，输出到本 Issue 目录，**不覆盖任何旧结果**。哈希一致证明原件完整、源码可复用，不证明本次重新操作过 App。

## 逐步入口、角色与结果核对

以下与手册逐行核对，采用 #58/#59 的甲 `Day6-owner`、乙 `Day6-member` 原数据：账本 `ff9ad3c4-0e0b-4edc-89f5-92be34bbbeea`，批次 `57e2ed3b-dce7-425b-98ba-f2f0b90bc0b4`。账本 ID 以[原 SQL](evidence/issues58-59/db-archived.json)和[本次重算](evidence/issue61/native-assertions.json)为可执行依据。表内“实际”是原报告实操结果，本次做源码/文档及原附件核对；未将历史图复制或重新嵌入为新图。

| 角色 / 入口与操作                            | 预期 → 已有实际结果                                                                               | 候选与有效原证据 / 本次核对                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未登录用户：欢迎→登录；甲/乙输入真实账号密码 | login 后还需 getMe 核验，之后才可读账本                                                           | #58/#59 主链 `89d0166`、#60 `c954dda` 的真实登录成功；[Day6 主链表](issues58-59-final-acceptance.md#58t16--t27-正反路径)、[#60 增量表](issue60-native-candidate-validation.md#本轮实测与既有证据的边界)。注册 API 只准备夹具，不算 App 注册实操；App 注册入口与源码一致 |
| 甲：列表 + →创建账本→相册封面→创建并邀请成员 | COVER 绑定，ACTIVE/v1、1 人、0 分 → 实际已提交，测试 hook 一次改响应为 503，明确为未知结果        | #58/#59 01–07，原报告区分早期封面增量与最终收据复测。核对 CreateLedgerScreen、图片引用保留及原键显式重放，不能据 503 宣称回滚                                                                                                                                           |
| 乙：+ →加入账本→六位码→查看账本→确认加入     | 预览不加成员；确认后 2 人、ACTIVE/v2 → 原请求与 SQL 一致                                          | #58/#59 08–09；邀请码是当次有效夹具，不作为今天可用凭据。JoinLedgerScreen 与 A11/A12 仍一致                                                                                                                                                                             |
| 乙：记第一笔→120 元→两人人均→相册收据→保存   | 记录人/付款人乙，12000 分、各 6000、ACTIVE/v3 → 上传与消费已提交，503 后原引用/原键重放仅一笔消费 | #58/#59 10–15、真实 401 恢复及前后整行 SQL 一致。ExpenseFormScreen、分摊与上传实现未变；付款/分摊成员 ID 不能用 userId 替代                                                                                                                                             |
| 乙：余额明细→结算预览                        | 甲 −6000、乙 +6000，一笔甲→乙 6000；预览不冻结，乙无冻结入口 → ACTIVE/v3、无批次                  | #58/#59 16–17、db-preview；核对 A20/A22 和 SettlementPreviewScreen，服务端仍仅 ACTIVE 可预览                                                                                                                                                                            |
| 甲：结算预览→正式发起→确认冻结并结算         | expectedVersion=3 → SETTLING/v4，唯一正式批次，一笔 PENDING 6000                                  | #58/#59 22–24、db-frozen；预览版本、创建者权限、冻结后消费只读均一致，版本冲突需重新查询后确认                                                                                                                                                                          |
| 甲（付款人/创建者）：正式记录→登记已还→确认  | 整笔 6000，剩余 0，仍 SETTLING/v4；原消费仍 12000 → 登记人为甲、备注 Day6-6000                    | #58/#59 25–26、db-paid；本次重算原消费/分摊/收据/快照均未改变。收款人本身无登记权，登记不是支付或消费                                                                                                                                                                   |
| 甲创建者：确认整本结清→确认结清              | 全部 PAID 且逐人剩余 0 → SETTLED/v5，消费与快照不变                                               | #58/#59 27、db-settled；核对结清 service、只读进度及按钮条件。全部登记不会自行结清；零转账冻结后直接结清的既有集成证据另见 #57/#59                                                                                                                                      |
| 甲：归档账本/个人归档→确认→查看历史          | 只写甲 archivedAt，SETTLED/v5 不变；甲当前移出、历史可读原记录 → 原 SQL/HTTP 符合                 | #58/#59 28–31；核对 LedgerListScreen、LedgerDetailScreen、A27。历史收据授权查看继续引用未变的 [#49 历史实操](issue49-documentation-validation.md#双账号逐步实操验收表)，不伪称 Day6 又截图                                                                              |
| 乙：正常登录→当前列表→同一正式记录→历史      | 乙当前仍有账本，原批次/登记信息一致，乙历史为空 → 原 HTTP 两角色读取与 SQL 符合                   | #58/#59 32–34；重新执行既有断言，确认不是替乙归档、删除账目或失去成员读权限                                                                                                                                                                                             |
| 同账号 401/续期未知恢复；跨账号或主动放弃    | 凭据失效、页面门禁；同账号登录+getMe 才恢复输入/引用/原键；换账号或放弃清除，不自动写入           | 变化已在 #58/#59 10–21 及最终 `adff4d8` 35–41 重新原生实操，#60 再覆盖恢复与权限。当前源码相同；修正手册旧“身份失效即丢弃”描述，旧 #48 卸载表单结果仅为历史基线                                                                                                         |

上述受 Day6 影响的登录/恢复步骤已有变化后的原生操作，当前相对最终候选无运行时代码变化，因此本次引用有效复测，未重复制造相同实操或宣称本次设备验收。按份/按金额、12 人边界、角色拒绝与竞争的数据库/组件证据保持其原范围，详见 [#55](issue55-archive-permission-validation.md)、[#56](issue56-expense-image-validation.md)、[#57](issue57-settlement-invariants-validation.md)、[#59](issues58-59-final-acceptance.md#59t15--t26-原标准映射)。

## 30 项接口走查

本次逐项对照 endpoints、各输入/响应 Schema、路由注册、service 和公共 HTTP/幂等实现。机器审计检查 30 个唯一 ID/操作名、方法、展开后的完整路径、契约成功码、认证和幂等标记、实际模块路由注册；结果逐项列于 [audit.json](evidence/issue61/audit.json)。字段含义与角色/状态由下表人工源码走查补齐，机器通过不等于全部接口新发请求。

| ID                    | 字段 / 权限 / 实现走查结果                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A01 register          | 严格 username/email/password/acceptTerms:true；AuthResult=user+TokenPair，201，无 Bearer/业务键。对应 auth schema/service  |
| A02 login             | account（邮箱或用户名）+password；AuthResult，200，无 Bearer/业务键；成功不代替 App 的 getMe 准入                          |
| A03 logout            | 无 body；认证当前会话，revoked:boolean；本机清除不等于服务器撤销已确认                                                     |
| A04 getMe             | 无 body；认证账号 UserSelf 四字段；App 核验中不开放业务请求                                                                |
| A05 createLedger      | name、coverKey/coverImageId 恰一；本人未绑定 COVER，成功事务绑定；ledger+invitation，需键                                  |
| A06 listLedgers       | archived 字符串布尔/分页；本人 joinedAt/memberId 倒序；未归档 SETTLED 仍在当前列表                                         |
| A07 getLedger         | 成员含个人归档后可读；Detail 增 creatorUserId/myMemberId/三项个人金额/members                                              |
| A08 listMembers       | 同账本成员可读；Member.id 与 userId 含义分开，角色 CREATOR/MEMBER                                                          |
| A09 getInvitation     | 创建者可读已有 Invitation，含冻结后；id/code/expiresAt/expired/qrPayload，无则冲突                                         |
| A10 resetInvitation   | 无 body、需键，ACTIVE 创建者；7 天新码、旧码撤销，不改账本版本                                                             |
| A11 previewJoin       | code 严格六位大写；登录只读，返回名称/创建者/人数/alreadyMember/canJoin，不暴露流水                                        |
| A12 joinLedger        | code、需键；锁后重查邀请/状态/人数；已有成员进入、首次 ACTIVE 且未满 12；返回 ledgerId/memberId/alreadyMember              |
| A13 createExpense     | 标题/整数分/category/日期/payerMemberId/分摊/note?/receiptImageId?；ACTIVE 成员、需键，服务端重算与事务绑定；ExpenseDetail |
| A14 listExpenses      | from/to/payerMemberId/category 与分页交集、日期/ID 倒序；成员可读，Summary[]+page                                          |
| A15 getExpense        | 成员可读；Detail 中 recorder/payer/splits/receiptImageId/canEdit；不存在消费 404，canEdit 不代表可改删                     |
| A16 updateExpense     | 完整消费 body+version、需键；当前 notReady/501，不能承诺编辑权限/冲突已实现                                                |
| A17 deleteExpense     | query version、无 body、需键；当前 notReady/501，不能承诺已删除或版本冲突已实现                                            |
| A18 uploadImage       | multipart kind/ledgerId?/file；给 ledgerId 需 ACTIVE 成员，只预检、不绑定；真实图片校验、UploadedImage，上传不幂等         |
| A19 getImage          | 认证后二进制 JPEG/PNG；未绑定仅上传者、绑定后当前成员，含归档成员；no-store，不是公开 URL                                  |
| A20 getBalances       | 成员读取 expenseTotalCents、MemberBalance[]，正应收负应付，remaining 含已还影响                                            |
| A21 getStatistics     | Statistics 契约含 categories 与 members；service 501，App 禁用统计                                                         |
| A22 previewSettlement | ACTIVE 成员只读，ledgerVersion/members/plan transfers/algorithmVersion；不存批次、不冻结                                   |
| A23 startSettlement   | expectedVersion=最新预览版本，ACTIVE 创建者、需键；锁内精确计算，batch+ledgerStatus；零转账直接 SETTLED                    |
| A24 getSettlement     | 成员含归档后读正式批次，netSnapshot 直接在 data（不是 data.batch）；无批次 404                                             |
| A25 markTransferPaid  | body 必须对象，可 {} 或 note≤200；需键、付款人或创建者，PENDING 新登记需 SETTLING；已 PAID 保留首次信息                    |
| A26 settleLedger      | 无 body、需键，创建者、全部 PAID 且每位 remaining=0；返回 ledgerId/status/settledAt，重复保留首次时间                      |
| A27 archiveLedger     | 无 body、需键，SETTLED 成员；只写本人 archivedAt，返回 ledgerId/archivedAt，不改账本状态/版本/其他人                       |
| A28 updateProfile     | 严格 username；UserSelf 契约，实际 501，账号资料只读                                                                       |
| A29 updatePreferences | 严格 notificationEnabled:boolean；同名响应契约，实际 501，不保存开关、不发送通知                                           |
| A30 refresh           | 严格 43 位 base64url refreshToken，无 Bearer；返回 TokenPair 不含 user；单次轮换、重放撤销，不自动重试                     |

金额依旧 bigint 整数分、JSON 十进制字符串；成员 ID、消费版本和账本版本各自独立。成功幂等结果按用户+操作/资源+键保留 7 天，客户端原尝试只允许 24 小时内显式原键重试；未知结果不会因重试遇到断网/权限错误而解除。登记只改进度/剩余净额，消费与原快照不变；归档只影响本人。字段/错误表与源码相符，新增说明仅反映移动端同账号核验恢复及核验前 JSON/图片准入；没有新接口或业务字段。

## 安装、地址与证据版本

| 核对项         | 结果                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次与日常命令 | 根 package.json、mobile/package.json、scripts 与 README/安装说明相符：首次 install→setup→build:android/ios→dev；日常 dev 检查数据库/编译/启动，不安装原生、不迁移；新迁移单独 migrate:db                                                                |
| API 地址       | Base URL 不加 /api/v1；Android 10.0.2.2 或 localhost+adb reverse、iOS 模拟器 localhost、真机用电脑局域网地址。API 与 Metro 分别转发，重连重设；改公开 API 地址重启 Metro/重载，改变原生网络配置重建                                                     |
| 原生输入       | 首次/原生依赖/config/plugin/assets/variant 改变需 build:android 或 build:ios（含 Prebuild）；兼容 JS/文档变化不要求重建。不手改 ios/android、不将 export:mobile 当安装                                                                                  |
| APK            | 复用记录来源为 `2097271`，development 0.1.0/versionCode 1，99,547,334 字节、SHA-256 `72504440573ae6985ad362bbd53854b03b46ac4d5a97c17513b0b53a61bbecf0`；本次读取的是原证据，不是重新 pull 设备                                                          |
| 实际 JS        | #58/#59 主链 `89d0166` 和最终 `adff4d8` 分别记录 bundle；#60 `c954dda` 的 bundle 为 10,064,573 字节、SHA-256 `2b310f1dec974d24f04abfe9b3858ee709dfca56f9179b32b1b66eac7439dd3d`、API 3360/Metro 8060。本次只重算项目源码哈希，不能据此声称加载过 #61 JS |
| 设备/环境      | 原证据为 macOS、Android 17/API37 ARM64 模拟器、真实隔离 PostgreSQL。#60 已清理专用容器/API/Metro，手册普通启动不依赖这些历史服务仍运行；复现其环境按原报告重新准备                                                                                      |
| 链接/附件      | 本次审计覆盖 README、手册、索引、限制、安装、本文及 #49/#58–59/#60 报告的本地 Markdown 目标、锚点和附件。保留旧报告日期/版本，图片仅引用原路径，不复制或再次嵌入；外部站点可用性不在本地链接检查范围                                                    |

## 本次实际验证

本次执行锁定安装、完整静态检查和文档/证据审计；Node 24.22.0（仓库指定 24.21.0，patch 差异保留）、pnpm 12.6.0。审计工具放在 docs/evidence，不修改应用、共享包、依赖或迁移。

| 实际命令                               | 结果与范围                                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | 通过，锁文件不变                                                                                                                                                                                           |
| `pnpm check`                           | 类型、ESLint、格式检查通过，见 [check.txt](evidence/issue61/check.txt)；含证据工具的静态检查                                                                                                               |
| `node docs/evidence/issue61/audit.mjs` | 30 项登记/路由、9 份文档本地链接、历史附件与源码哈希通过；[审计](evidence/issue61/audit.json)、[SQL/HTTP 复用核对](evidence/issue61/reuse.json)、[原链路断言重算](evidence/issue61/native-assertions.json) |
| `git diff --check`                     | 通过；历史报告/证据无改写，产品源码无修改                                                                                                                                                                  |

本次未执行 pnpm test/test:mobile/test:integration、export、Expo Doctor、原生构建/安装、App 操作或数据库请求。#60 的 125 项无数据库、244 项组件、136 项集成、21/21 Doctor 与 JS 导出只作为其原候选结果引用；不填成本次执行。最终文档提交 SHA、PR 及该 head 的 CI 另列在 PR 描述和 Issue 回执，候选旧绿灯不代替最终 head。

## Day7 候选变更重验与交付

1. 固定最终 main SHA、新 worktree/分支和实际设备环境，先按上述路径比较 `bade612`；纯文档差异仅检查文字/命令/链接/附件及适用格式。T18 以最终候选原标准验收，日 Issue/PR 完成不自动扣整项点数。
2. contracts/HTTP/权限/事务/幂等/金额/迁移有变化时，逐行重核对应接口 ID、方法、路径、输入/响应、错误及角色；运行适用 check、无数据库与真实独立 TEST_DATABASE_URL 集成测试。新增迁移审查 SQL、显式应用，API 启动不迁移；共享包变化另 export:mobile 与 Expo Doctor。
3. App feature、认证/导航/请求/图片/提交封装变化时，重做受影响角色、入口和异常路径；认证/准入变化至少覆盖真实 401、错密、核验中、同账号保留引用/原键、跨账号清除、断网迟到 200、联网不自动写入，随后确认正常主链仍可达。实际成功业务步骤由 App 操作，HTTP/SQL 只做夹具准备、故障探针和只读核对；记录受影响 UI 截图。
4. 原生依赖、配置、plugin、资源、variant 改变时先 expo install --check、Doctor，再对应平台 build（含 Prebuild）/安装，记录新 APK/IPA 来源与哈希；设备/系统/权限环境改变也重验相关原生步骤。API/Metro 地址与设备转发单独记录，重载后核对沙盒实际 JS/source map 与候选，不能只凭终端 Metro 路径推断设备加载版本。
5. 完整交付仍核对登录→封面建账/加入→消费收据→余额预览→冻结→整笔已还→创建者结清→本人归档/历史与另一成员隔离；金额用独立常量核对，预览无写入、已还非消费、原快照不变、图片授权/未授权读取分开。变化路径保存新证据；未变部分列出原候选、复用 diff 和原附件，不改旧报告。
6. PR 列出最终候选/验证 SHA、实装包与实际 JS、本人实际命令、未验范围和当前 head CI；交架构负责人审核。需要保留旧提交时普通 merge，不自行 rebase。T18 整项、Day7 发布准备和点数留待原标准完整验收，本次不发布/部署或合并。

遗留边界沿用[当前已知限制](known-limitations.md)：A16/A17/A21/A28/A29 为 501、扫码未开放；人工整笔登记不验证到账，无撤销/部分还款；iOS 当前完整主链、物理真机、成功拍照、物理弱网、Windows/Linux 安装全流程、签名发布和生产部署仍未验收。本次未发现需改业务源码的新缺陷；以上文档验收完成后可用 Closes #61 关联，但不据此认定 T18 最终整项已验收。
