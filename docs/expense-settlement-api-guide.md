# 消费、图片、正式结算与个人归档操作说明

2026-10-26，负责人袁湘湘（@circlexxl），对应 [Issue #34](https://github.com/Liangbai2333/tongzhang/issues/34)，承接 [#20 建账/邀请索引](ledger-invitation-api-guide.md)。首次原生实操使用基线 `5abf9b0` 加源码提交 `e653669b9613fb6403b2aba1d2a166dc92cae515`，与 [#31 原生验收](issue31-native-acceptance.md)的客户端、API、数据库及当日截图一致。后续审查仅补充两种错误同时显示的修复与组件回归，见 [PR #40 审查补充](issue31-native-acceptance.md#pr-40-合并前审查补充)；接口与服务端版本未变，原生截图仍归属首次验收版本。

## 当前可用范围

| 能力                                 | API                              | 当前 App 入口与本轮证据                                                                            |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| 消费新增/列表/详情、人均/按份/按金额 | A13–A15 已实现                   | 已接通；本轮原生实操 ¥120 两人人均，三种分摊的其他边界由既有测试覆盖                               |
| 消费修改/删除                        | A16/A17 为 501 `NOT_IMPLEMENTED` | 未开放；详情中的 `canEdit` 是权限信息，不代表编辑功能已实现                                        |
| 收据选图/上传/授权读取               | A18/A19 已实现                   | 相册、压缩、保存绑定、成员预览已原生验证；本轮未验相机                                             |
| 自定义封面上传/事务绑定/授权读取     | A18 + A05 + A19 已实现           | 仅通过真实 API 核对。App 创建页仍为预设封面，列表/详情也未接自定义图片展示                         |
| 余额                                 | A20 已实现                       | “余额明细”已接通并原生验证；支出统计 A21 仍未开放                                                  |
| 预览/正式冻结/正式记录               | A22/A23/A24 已实现               | 预览、创建者确认面板、正式记录、登记元数据读取与复制已接通                                         |
| 整笔登记已还/创建者结清              | A25/A26 已实现                   | 本轮通过真实 API 操作；App 登记按钮禁用，结清写入口未接，不描述为 App 内完整闭环                   |
| 个人归档                             | A27 已实现                       | 归档写入口未接；列表下方“已归档账本”读取入口已接通。本轮 API 归档甲，再以甲 App 登录读到该历史账本 |
| 临时图片清理                         | 独立命令与生产调度配置已实现     | 本轮在独立库运行命令，删除 1 张过期未绑定图；生产定时执行未在本次部署验收                          |

已完成的协议/隐私面板不在本轮重复开发。历史文档反映各自日期；本次接口/App 状态以本页及源码提交为准。

## 共同调用规则

字段以 [endpoints.ts](../packages/contracts/src/endpoints.ts)、[expenses.ts](../packages/contracts/src/expenses.ts)、[images.ts](../packages/contracts/src/images.ts)、[settlements.ts](../packages/contracts/src/settlements.ts)、[ledgers.ts](../packages/contracts/src/ledgers.ts)为准；实际行为核对 [消费 service](../apps/server/src/modules/expenses/service.ts)、[图片 service](../apps/server/src/modules/images/service.ts)、[正式冻结](../apps/server/src/modules/settlements/start.ts)、[登记/结清](../apps/server/src/modules/settlements/progress.ts)、[归档](../apps/server/src/modules/ledgers/service.ts)、[清理](../apps/server/src/modules/images/cleanup.ts)与 [HTTP 适配](../apps/server/src/http/operation.ts)。

- 表内路径均含 `/api/v1`。常规开发地址 `http://localhost:3300`；本轮隔离 API 3331，App 经代理 `http://127.0.0.1:3332`，Metro 8091，PostgreSQL `tongzhang_issue31_34`。地址配置与真机/Android 规则见[开发说明](development.md)。
- 所有下列接口均须 `Authorization: Bearer <accessToken>`。通过真实注册/登录取得 `data.accessToken`；15 分钟 Access Token 可经刷新接口轮换，退出即时撤销。令牌、密码、原始幂等键不写入截图或证据。
- JSON body 使用 `Content-Type: application/json`。无 body 的 GET、A26、A27 不发送 `{}` 或 JSON `null`，也不设置 JSON Content-Type；A25 则需要 JSON body，可为 `{}`。
- 金额在 API 中是整数分十进制字符串，`"12000"` = ¥120、`"6000"` = ¥60；使用 bigint 计算，不能把浮点元数传给接口。`memberId` 是账本成员 ID，不能使用用户 ID。
- 标记“必需”的写接口携带 UUID `Idempotency-Key`。同一用户/方法路径/键/内容重放返回首次成功响应，同键换内容为 409 `IDEMPOTENCY_CONFLICT`。成功结果保存 7 天；当前 App 在内存中只允许 24 小时内重试原尝试，未知结果锁定原内容，不自动重试。
- A18 上传不提供业务幂等；上传成功必须保留返回的图片 ID，业务保存失败时复用该 ID。上传连接丢失可能留下未绑定图片，由清理命令处理，不能声称上传本身恰好一次。
- 成功 JSON 包在 `data` 中；列表带 `page.nextCursor`；图片读取是二进制。错误为 `{error:{code,message,fieldErrors?},requestId}`，金额错误不应自行转换为 0。所有读取在线，响应 `Cache-Control: no-store`；App 不持久化业务数据、不建立离线队列。

## 方法、路径与权限索引

下表 `L` 表示 `/api/v1/ledgers/:ledgerId`。

| 编号 | 方法 / 路径                                    | 请求与成功响应                                                   | 服务端角色/状态                                       | 幂等 |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ---- |
| A13  | `POST L/expenses`                              | 消费 body；201 `{data:ExpenseDetail}`                            | ACTIVE 成员；服务端重算分摊并事务绑定收据             | 必需 |
| A14  | `GET L/expenses`                               | query 筛选/分页；200 `{data:ExpenseSummary[],page:{nextCursor}}` | 账本成员                                              | 无   |
| A15  | `GET L/expenses/:expenseId`                    | 无 body；200 `{data:ExpenseDetail}`                              | 账本成员                                              | 无   |
| A18  | `POST /api/v1/images`                          | multipart；201 `{data:{imageId,mimeType,byteSize,width,height}}` | 已登录；给 ledgerId 时须为 ACTIVE 成员                | 无   |
| A19  | `GET /api/v1/images/:imageId`                  | 无 body；200 JPEG/PNG 字节                                       | 未绑定仅上传者；绑定后仅账本成员                      | 无   |
| A20  | `GET L/balances`                               | 无 body；200 `{data:{expenseTotalCents,members}}`                | 账本成员                                              | 无   |
| A22  | `GET L/settlement-preview`                     | 无 body；200 `{data:SettlementPreview}`                          | ACTIVE 成员；只读，不冻结                             | 无   |
| A23  | `POST L/settlement`                            | `{expectedVersion}`；201 `{data:{batch,ledgerStatus}}`           | ACTIVE 创建者，版本一致                               | 必需 |
| A24  | `GET L/settlement`                             | 无 body；200 `{data:SettlementDetails}`                          | 成员，已有正式批次                                    | 无   |
| A25  | `POST L/settlement/transfers/:transferId/paid` | `{note?}`；200 `{data:{transfer,progress}}`                      | SETTLING 的该笔付款人或创建者；已 PAID 重放保留原登记 | 必需 |
| A26  | `POST L/settle`                                | **无 body**；200 `{data:{ledgerId,status,settledAt}}`            | 创建者；全部 PAID 且每人剩余净额为零                  | 必需 |
| A27  | `POST L/archive`                               | **无 body**；200 `{data:{ledgerId,archivedAt}}`                  | SETTLED 当前成员，仅归档本人                          | 必需 |
| A06  | `GET /api/v1/ledgers`                          | `archived=true/false`、limit/cursor；200 列表 envelope           | 本人的成员账本，默认 false                            | 无   |

A05 自定义封面创建仍是 `POST /api/v1/ledgers`，body 为 `{name,coverImageId}`，与 `coverKey` 必须且只能提供一个，要求业务幂等键；201 返回 `{data:{ledger,invitation}}`。未实现的 A16 `PATCH L/expenses/:expenseId`、A17 `DELETE L/expenses/:expenseId` 仅有路由/契约，不纳入可用索引。

### 请求字段

| 请求     | 字段及约束                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A13 通用 | `title` trim 后 1–60 字；`amountCents` 1–999999999 分字符串；`category` 为 DINING/TRANSPORT/TICKET/LODGING/SHOPPING/OTHER；`occurredOn` 为有效 YYYY-MM-DD；`payerMemberId` 为同账本成员；`note` 可省略/null/最多 500 字；`receiptImageId` 可省略/null/UUID |
| A13 分摊 | `splitMode` EQUAL/SHARES/AMOUNT；`splits` 1–12 个不重复的同账本成员。EQUAL 项 `{memberId}`；SHARES 项 `{memberId,shares}`，shares 整数 1–10000；AMOUNT 项 `{memberId,amountCents}`，非负整数分字符串，合计严格等于消费额。付款人可以不参与分摊             |
| A14      | 可选 `from`、`to` 有效日期且 from≤to；`payerMemberId`、`category` 与日期取交集；`limit` 1–50 默认 20；cursor 只传上一页原始 `nextCursor`，无下一页时省略。按消费日期、ID 倒序                                                                              |
| A18      | 文本字段 `kind` 为 COVER/RECEIPT，可选 `ledgerId`；文件字段 `file`，JPEG/PNG，单张≤1048576 字节，边长≤4096、≤1600 万像素，实际解码且 MIME 一致，不接收动画多页图。最多一个文件                                                                             |
| A23      | `expectedVersion` 正整数，必须来自最近一次 A22 的 `ledgerVersion`，不可自行加一；锁内重查权限/状态并重新求解                                                                                                                                               |
| A25      | `note` 可省略、最多 200 字；不接受金额、部分还款、PAID 以外状态或撤销参数                                                                                                                                                                                  |
| A06      | `archived` 是字符串 `"true"` / `"false"`，默认 false；是本人归档状态，不是财务状态筛选，未归档 SETTLED 也在 false 中                                                                                                                                       |

### 响应字段与生命周期

- `ExpenseSummary`：`id,title,amountCents,category,occurredOn,payerMemberId,payerName,version`。`ExpenseDetail` 另含 `ledgerId,recorderMemberId,recorderName,splitMode,splits,note,receiptImageId,createdAt,updatedAt,canEdit`；每个 split 为 `memberId,username,shares(null或整数),amountCents`。
- `MemberBalance`：`memberId,username,paidCents,sharedCents,netCents,remainingNetCents`。净额正数应收、负数应付；还款仅影响剩余待收付，不是消费，不改变原消费总额、原已付/应摊。
- `SettlementPreview`：`ledgerId,ledgerVersion,expenseTotalCents,transferTotalCents,transferCount,members,transfers,algorithmVersion`。每个方案项 `sequence,payerMemberId,payeeMemberId,amountCents`，最多 11 笔。
- A23 的 `batch`：`id,ledgerId,sourceVersion,expenseTotalCents,transferTotalCents,transferCount,algorithmVersion,createdAt,ledgerStatus,transfers,progress`。正式 transfer 在方案项上增加 `id,status(PENDING/PAID),registeredByMemberId,registeredAt,registrationNote`，未登记元数据为 null。`progress` 为 `paidCount,totalCount,remainingCents`。
- A24 直接返回批次在 `data`，另有 `netSnapshot:[{memberId,netCents}]`；不是 `data.batch`。它读取冻结快照和当前进度，不重新生成批次。A25 返回登记项与进度，重复登记保留第一次的登记人、时间与备注。
- 财务状态 **ACTIVE → SETTLING → SETTLED**。A22 不冻结；A23 保存唯一批次、净额快照与转账并冻结，零转账保存批次后直接 SETTLED。转账全部登记仍需创建者 A26 确认结清；不自动取消冻结或重开。
- A27 只写当前成员 `archivedAt`，不改变账本财务状态、版本、其他成员或正式批次；归档后成员仍可读明细与收据。重复归档保留原时间。

## 两账号操作与当日实操核对表

先按[成员环境说明](environment-setup.md)准备独立测试库，执行迁移并启动真实 API/Metro。甲为创建者，乙通过真实邀请加入，第三账号丙不加入。令牌和密码放未提交的本地环境中。下面的 ID 仅用于对照本次证据，复测须使用本次新建账本返回的实际 ID。

| 步骤 | 操作入口/调用与预期                                                                                           | 当日结果和证据                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 甲 App 登录，打开两人账本，记 ¥120、甲付款、人均；相册选收据后保存                                            | 真实账本 `5a9c3b2a-c7f2-476a-ab36-082e4e01bd25`；消费 `fed2da49-980b-4900-ac92-e6427648769e`；各 `6000` 分。[详情](evidence/issue31-34/05-expense-detail.png)                                                                                                                                      |
| 2    | 甲/乙分别登录 App 读同笔消费与收据；丙直读应拒绝                                                              | 两成员成功，收据 ID `fd9505ce-488f-48db-ac2b-d22d4316fd37`，哈希相同；丙列表/详情/收据 403。[乙收据](evidence/issue31-34/16-member-receipt.png)、[真实响应](evidence/issue31-34/preview-and-access.json)                                                                                           |
| 3    | 甲查看余额、结算预览；打开确认再“返回检查”                                                                    | 甲 +¥60、乙 −¥60，一笔乙→甲 ¥60；取消后 ACTIVE、version 3，A24 404。[预览](evidence/issue31-34/08-preview.png)                                                                                                                                                                                     |
| 4    | 甲 App 正式确认；普通成员不得冻结；旧版本必须重查                                                             | 主账本唯一批次 `229d7f11-e55c-467a-b249-130d15e094f9`，SETTLING；普通成员无入口且 API 403。独立冲突账本实际返回 409 并在 App 重查成功。[确认](evidence/issue31-34/09-freeze-confirm.png)、[成员](evidence/issue31-34/17-member-no-freeze.png)、[冲突](evidence/issue31-34/13-version-conflict.png) |
| 5    | 读取 A24，先尝试未全部登记时 A26/A27                                                                          | 0/1、剩余 `6000`；提前结清 409 SETTLEMENT_INCOMPLETE，提前归档 409 LEDGER_STATE_INVALID。冻结后 A13 409 LEDGER_FROZEN                                                                                                                                                                              |
| 6    | **API** 乙作为付款人调用 A25，body `{note:"线下人工登记验收，不是真实支付"}`，同键重放；甲另键再登记          | 200，1/1、剩余 `0`；各次返回原登记人/时间/备注，没有新增消费。App 登记按钮仍禁用，本步骤不是 App 写入验收                                                                                                                                                                                          |
| 7    | **API** 乙 A26 应拒绝，甲无 body 调 A26；乙 App 重开正式记录                                                  | 乙 403，甲 200 SETTLED；批次仍相同、消费仍 `12000`，App 显示登记人与备注。[API 后的原生读取](evidence/issue31-34/18-settled-after-api.png)                                                                                                                                                         |
| 8    | **API** 甲 A27；对照甲/乙 A06；甲 App 列表底部“已归档账本”                                                    | 甲 `archived=false` 不含该账本，`true` 含；乙 `false` 仍含。甲正常重新登录 App，可在历史列表打开该账本。[个人历史](evidence/issue31-34/19-owner-archived-list.png)                                                                                                                                 |
| 9    | **API** 甲上传 COVER、A05 建账再邀请乙，比较绑定前后读取                                                      | 未绑定仅甲 200、乙 403；绑定后乙 200、丙 403。未以 App 预设图标冒充自定义图片展示验收                                                                                                                                                                                                              |
| 10   | 专用库的一张未绑定 RECEIPT 测试图片改为 25 小时前；运行 `PGDATABASE=tongzhang_issue31_34 pnpm cleanup:images` | 实际删除 1 张，原图读取 403；已绑定封面仍 200。[清理输出](evidence/issue31-34/cleanup.log)、[复读](evidence/issue31-34/cleanup.json)                                                                                                                                                               |

步骤 5–9 的具体响应/字段见 [生命周期与封面实操 JSON](evidence/issue31-34/lifecycle-and-images.json)，最终行数与个人归档状态见 [SQL 结果](evidence/issue31-34/database.json)。步骤 6 的转账 ID 来自 A24 `data.transfers[0].id`，不能将方案 sequence 或批次 ID 当作 transferId。

### API 调用示例

以下请求体中的成员 ID、账本 ID、图片 ID 均取真实响应；鉴权头及幂等键按共同规则提供。无 body 的操作必须使用不含 JSON 请求体的 POST。

```json
{
  "title": "两人午餐",
  "amountCents": "12000",
  "category": "DINING",
  "occurredOn": "2026-10-26",
  "payerMemberId": "<甲的账本成员UUID>",
  "splitMode": "EQUAL",
  "splits": [{ "memberId": "<甲成员UUID>" }, { "memberId": "<乙成员UUID>" }],
  "receiptImageId": "<A18返回imageId>",
  "note": "两人人均"
}
```

A18 用 multipart 的 `kind=RECEIPT`、`ledgerId=<实际账本ID>` 和 `file=@receipt.jpg`，不要手设 boundary；COVER 建账前可省略 ledgerId。A23 使用 A22 返回值组成 `{expectedVersion:3}`；A25 用 `{note:"人工登记"}`；A26/A27 无 body。A06 已归档查询例为 `/api/v1/ledgers?archived=true&limit=20`。

## 图片归属、事务与清理

图片字节存放独立 `image_assets` 的 bytea，业务只保存引用。上传带 ledgerId 仅预查权限与 ACTIVE，不提前绑定；未绑定仍仅上传者可读。保存消费/账本时，service 在业务事务中锁图片，校验上传者、kind、未绑定状态及目标归属，再提交业务、关联、版本、审计和幂等响应。不能挪用别人的图、已绑定封面或另一消费的收据。业务失败不能回滚已完成上传，App 保留已上传引用供手动再提交。

清理是独立命令，不在 API 启动时执行。仅清理超过 24 小时、ledgerId 为 null、且没有封面/收据引用的资产；未过期、已绑定、任何业务仍引用（含软删除消费）的图片保留。分批 100 张，使用图片行锁和 SKIP LOCKED，正在绑定的图本轮跳过；先删除则业务绑定失败并整体回滚。生产命令/每小时 systemd 调度配置见[临时图片清理与调度](development.md#临时图片清理与调度)，本轮不宣称生产调度运行成功。并发锁竞争由主线 [#32 回归](issue32-regression-validation.md)覆盖，本次未将其旧日志作为当日运行。

## 错误与恢复

| HTTP / code                               | 含义与操作                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 400 VALIDATION_ERROR                      | 字段、分摊、日期、幂等键或无 body 规则不符；改正后显式提交                                                |
| 400 IMAGE_INVALID / 413 PAYLOAD_TOO_LARGE | 图片解码/MIME/尺寸不符或超限；重新选合法图片，原表单保留。当前 App 会先压缩                               |
| 401 UNAUTHENTICATED                       | 会话无效，按正常刷新/登录恢复，不能绕过鉴权读取旧业务缓存                                                 |
| 403 FORBIDDEN                             | 非成员、角色不符或图片归属不符；不假设换键能解决。不存在/无权图片也返回 403                               |
| 404 NOT_FOUND / SETTLEMENT_NOT_FOUND      | 消费不存在/没有正式批次；只读预览未冻结时 A24 404 是预期，不代表接口未实现                                |
| 409 LEDGER_FROZEN                         | 账本已冻结，禁止新增消费/带账本上传等 ACTIVE 写入；保留输入，返回在线核对                                 |
| 409 VERSION_CONFLICT                      | A23 旧版本；重新在线读取账本及预览，用户再次确认后新尝试，不能静默改版本重发                              |
| 409 IDEMPOTENCY_CONFLICT                  | 同键不同内容；核对原提交，不自动换键造成重复业务                                                          |
| 409 LEDGER_STATE_INVALID                  | 当前状态不支持，如未 SETTLED 时归档；先完成相应状态流程                                                   |
| 409 SETTLEMENT_INCOMPLETE                 | 全部转账尚未 PAID 或剩余净额非零，拒绝结清                                                                |
| 501 NOT_IMPLEMENTED                       | 已登记路由的业务未实现，如消费改删、统计，不显示为可用                                                    |
| 网络中断/超时/5xx/响应无效                | 写入可能已完成。当前 App 保留输入、上传引用、原幂等键，只允许显式重试或在线核对；没有离线队列或自动写重试 |

本次实际覆盖的错误及修复前后截图见 [#31 用例表](issue31-native-acceptance.md)；本页枚举完整常见错误语义，不声称所有列项均在本日原生操作。

## 验证与交付边界

本轮安装、迁移、`pnpm check`、112 项无数据库测试、178 项移动端替身测试、双平台 JS 导出及 Expo Doctor 21/21 均通过，命令和日志链接见 [#31 验证记录](issue31-native-acceptance.md#验证命令与结果)。[证据清单](evidence/issue31-34/manifest.json)记录文件哈希、运行源码提交和环境，用于识别截图/响应是否来自本轮；[真实请求时序](evidence/issue31-34/requests.json)区分准备、App 请求与后续 API 核对。

本日 #34 的说明与实操核对已交付，不代表 T18 整项提前完成，不扣整项 8 点。未接通 App 的登记、结清、归档写入、自定义封面及扫码/统计/消费改删仍保留原任务范围；未做 Android 原生安装、物理真机或生产部署。所有 screenshot 均为本次 iOS 模拟器直接捕获，API 操作后的 App 读取已明确标注，不能据此声称 App 写流程已接通。
