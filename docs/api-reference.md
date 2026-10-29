# 当前接口索引

Day7 固定交付候选 `df4d773` 的30项登记方法、路径、成功码、认证、幂等和路由已重新对照通过，见 [最终交付核对](day7-delivery-acceptance.md)。此前完整字段与service走查见 [#61历史结果](issue61-candidate-documentation-validation.md#30-项接口走查)；Day7已有UUID规范化、公共游标及校验细化，不再声称实现与Day5完全未变。UUID经契约规范化为小写，接口形状和下表登记保持一致；不把后续工程改动自动计入固定包原生验收。登记不等于实现，501项仍按下表明确列出。

## 通用协议与安全边界

- Base URL 只到主机/端口，路径均为 `/api/v1`；下表 `L` = `/api/v1/ledgers/:ledgerId`。所有业务操作在线，返回 `Cache-Control: no-store`。开发 Swagger 在 `/docs`，生产关闭。健康检查 `/health/live`、`/health/ready` 和 `/api/v1/system/info` 不计入 A01–A30。
- 除 A01/A02/A30 外都需 `Authorization: Bearer <accessToken>`，邀请预览也需登录。A01/A02 返回 `{data:{user,accessToken,accessTokenExpiresAt,refreshToken,refreshTokenExpiresAt}}`；A30 只返回 token pair，不含 user。Access Token 15 分钟，Refresh Token 最长 30 天、单次轮换、重用撤销会话；退出撤销当前会话。App SecureStore 仅保存刷新凭据，业务数据不持久化。密码/令牌/原始幂等键不入文档证据。
- JSON 请求有 body 才设置 `Content-Type: application/json`。GET 与标记「无 body」的 A03/A10/A26/A27/A17 不发送 `{}`、`null` 或空 JSON body。A25 必须有 JSON 对象，可为 `{}`。A18 multipart 的 boundary 交给客户端库生成。
- 常规成功 `{data:...}`，分页 `{data:[],page:{nextCursor:null或字符串}}`；A19 成功直接返回 JPEG/PNG 二进制。失败 `{error:{code,message,fieldErrors?},requestId}`；不要依赖每种错误都有 fieldErrors。无下一页时不传 cursor；limit 1–50、默认 20，cursor 使用上一页原值。
- 所有金额为整数分十进制**字符串**：`"12000"` = ¥120，`"-6000"` = 应付 ¥60。禁止 JSON 数字、浮点元、`"120.00"`、前导零、负零。共享计算使用 bigint；通用金额范围为 PostgreSQL BIGINT，单笔消费 1–999999999 分。UUID 用于 ID，时间 ISO 带时区，消费日期为有效 YYYY-MM-DD。
- `Member.id` / `myMemberId` 是当前账本成员 ID；`Member.userId` / `creatorUserId` 是账号 ID。付款、分摊、转账与登记人使用**成员 ID**，不可用账号 ID 代替。服务端重查成员关系、角色与状态；知道账本/图片 ID 或邀请码不等于拥有成员权限。
- 下表「键」为必需 UUID `Idempotency-Key`。范围为当前用户 + 方法/资源路径（含实际 ID）+ 键，内容按服务端规范化 JSON 求哈希；同键同内容重放首次成功，同键不同内容 409 IDEMPOTENCY_CONFLICT。只保存成功结果，7 天；与业务写入共事务，重放仍核验权限。旧响应可能含旧人数/进度，重放后重新 GET 当前数据。A18 上传没有这项保证。
- App 业务写入没有自动重试；当前页原尝试 24 小时内可显式重试原键/原内容。超时/网络异常/5xx/无效响应均可能已落库；再次断网不会解除未知状态，不能改内容换键重提。重启或时限过后先在线核对。详见[恢复操作](app-user-guide.md#图片权限与失败恢复)及 [use-idempotent-write](../apps/mobile/src/lib/use-idempotent-write.ts)。认证层只在发送前刷新，业务返回 401 不自动重发。
- Day6 App 在 401/续期结果未知时清除凭据，保留存活进程内被门禁遮挡的原表单、图片引用及原键；同账号重新登录并在线 `getMe` 成功才恢复，换账号/放弃/退出清除原内存。核验完成前业务 JSON、上传和图片读取均由[准入检查](../apps/mobile/src/lib/session-admission.ts)阻断；旧会话迟到响应不能继续业务写入，断网后迟到核验 200 也不能放行。该行为不增加 API 字段、不延长 24 小时窗口，不提供持久草稿。

## 全量路径、请求与实际权限

状态码列为**成功**码；未实现项只表示契约期望，实际为 501。无「键」的接口不要求业务幂等键。

| ID / 操作             | 方法与路径                                     | 请求 → 成功 data                                                                   | 实际权限 / 状态 / App 范围                                     | 键               |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------- |
| A01 register          | POST `/api/v1/auth/register`                   | `{username,email,password,acceptTerms:true}` → AuthResult，201                     | 无需登录；App 注册                                             | —                |
| A02 login             | POST `/api/v1/auth/login`                      | `{account,password}` → AuthResult，200                                             | account 为邮箱或用户名；App 登录                               | —                |
| A03 logout            | POST `/api/v1/auth/logout`                     | 无 body → `{revoked:boolean}`，200                                                 | 当前认证会话；App 退出                                         | —                |
| A04 getMe             | GET `/api/v1/me`                               | 无 body → UserSelf，200                                                            | 当前账号；App 在线核验/资料读取                                | —                |
| A05 createLedger      | POST `/api/v1/ledgers`                         | `{name,coverKey或coverImageId}` → `{ledger,invitation}`，201                       | 登录者；App 预设或相册封面建账                                 | 必需             |
| A06 listLedgers       | GET `/api/v1/ledgers`                          | query `archived,limit,cursor` → LedgerSummary[] + page，200                        | 仅本人当前/归档成员账本                                        | —                |
| A07 getLedger         | GET `L`                                        | 无 body → LedgerDetail，200                                                        | 成员，包含个人归档后                                           | —                |
| A08 listMembers       | GET `L/members`                                | 无 body → Member[]，200                                                            | 成员                                                           | —                |
| A09 getInvitation     | GET `L/invitation`                             | 无 body → Invitation，200                                                          | 创建者；冻结后可读已有邀请                                     | —                |
| A10 resetInvitation   | POST `L/invitation/reset`                      | 无 body → Invitation，200                                                          | ACTIVE 创建者                                                  | 必需             |
| A11 previewJoin       | POST `/api/v1/invitations/preview`             | `{code}` → JoinPreview，200                                                        | 登录者，只读；满员/冻结返回 canJoin:false                      | —                |
| A12 joinLedger        | POST `/api/v1/invitations/join`                | `{code}` → `{ledgerId,memberId,alreadyMember}`，200                                | 非成员需有效邀请、ACTIVE、未满 12；已有成员另作进入处理        | 必需             |
| A13 createExpense     | POST `L/expenses`                              | 消费 body → ExpenseDetail，201                                                     | ACTIVE 成员；重算分摊、事务绑定收据                            | 必需             |
| A14 listExpenses      | GET `L/expenses`                               | query `from,to,payerMemberId,category,limit,cursor` → ExpenseSummary[] + page，200 | 成员，筛选取交集，日期/ID 倒序                                 | —                |
| A15 getExpense        | GET `L/expenses/:expenseId`                    | 无 body → ExpenseDetail，200                                                       | 成员                                                           | —                |
| A16 updateExpense     | PATCH `L/expenses/:expenseId`                  | 完整消费 body + `version` → 契约 ExpenseDetail/200                                 | **实际 501 NOT_IMPLEMENTED；App 无可用编辑**                   | 必需（路由校验） |
| A17 deleteExpense     | DELETE `L/expenses/:expenseId`                 | query `version`，无 body → 契约 `{deletedId}`/200                                  | **实际 501；App 无可用删除**                                   | 必需（路由校验） |
| A18 uploadImage       | POST `/api/v1/images`                          | multipart `kind,ledgerId?,file` → UploadedImage，201                               | 登录者；给 ledgerId 需 ACTIVE 成员，仅预检不绑定               | —                |
| A19 getImage          | GET `/api/v1/images/:imageId`                  | 无 body → JPEG/PNG 二进制，200                                                     | 未绑定仅上传者；绑定后仅成员，匿名 401/非成员 403              | —                |
| A20 getBalances       | GET `L/balances`                               | 无 body → `{expenseTotalCents,members}`，200                                       | 成员；App 余额明细                                             | —                |
| A21 getStatistics     | GET `L/statistics`                             | 无 body → 契约 Statistics/200                                                      | **实际 501；App 统计禁用**                                     | —                |
| A22 previewSettlement | GET `L/settlement-preview`                     | 无 body → SettlementPreview，200                                                   | ACTIVE 成员，纯读取不冻结                                      | —                |
| A23 startSettlement   | POST `L/settlement`                            | `{expectedVersion}` → `{batch,ledgerStatus}`，201                                  | ACTIVE 创建者，锁内核对预览版本并求精确最少笔数                | 必需             |
| A24 getSettlement     | GET `L/settlement`                             | 无 body → SettlementDetails，200                                                   | 成员，已有正式批次                                             | —                |
| A25 markTransferPaid  | POST `L/settlement/transfers/:transferId/paid` | `{note?}` → `{transfer,progress}`，200                                             | 新登记需 SETTLING 该笔付款人或创建者；已 PAID 保留首次登记信息 | 必需             |
| A26 settleLedger      | POST `L/settle`                                | 无 body → `{ledgerId,status:"SETTLED",settledAt}`，200                             | 创建者、全部 PAID 且每人剩余净额 0；已结清可重复确认           | 必需             |
| A27 archiveLedger     | POST `L/archive`                               | 无 body → `{ledgerId,archivedAt}`，200                                             | SETTLED 当前成员；只归档自己，重复保留原时间                   | 必需             |
| A28 updateProfile     | PATCH `/api/v1/me`                             | `{username}` → 契约 UserSelf/200                                                   | **实际 501；App 资料只读**                                     | —                |
| A29 updatePreferences | PATCH `/api/v1/me/preferences`                 | `{notificationEnabled:boolean}` → 契约同名字段/200                                 | **实际 501；未保存开关或发送通知**                             | —                |
| A30 refresh           | POST `/api/v1/auth/refresh`                    | `{refreshToken}` → TokenPair，200                                                  | 不需 Bearer；刷新令牌轮换，App 会话管理                        | —                |

认证/参数/幂等校验先于未实现 handler，因此不合法请求可先返回 400/401，而非所有 A16/A17 请求都直接 501。

## 输入字段核对

| 输入        | 约束                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01/A02/A30 | username trim 后 2–30；注册邮箱规范为小写、≤254 字符；注册密码 8–72 字符且 UTF-8 ≤256 字节；登录 account trim 1–254、password 非空且 ≤256 字符/字节。刷新令牌为 43 位 base64url。注册必须 acceptTerms:true                                                   |
| A05         | name trim 1–40；coverKey 为 mountain/dining/city/plain，与 coverImageId UUID **恰好一个**。自定义图必须是本人上传、未绑定的 COVER，创建事务成功才绑定                                                                                                        |
| A06         | archived 为字符串 `"true"`/`"false"`，默认 false；筛选本人 archivedAt，不是财务状态。未归档 SETTLED 仍在 false 列表；按本人成员加入时间及成员 ID 倒序                                                                                                        |
| A11/A12     | code 六位大写字符 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`，不含 0/1/I/O。API 不代转大写，App 会 trim/转大写。邀请 7 天有效，重置旧码失效；qrPayload 为 `tongzhang:invite:v1:<code>`，不代表已实现扫码                                                             |
| A13 通用    | title trim 1–60；amountCents 为 1–999999999 分字符串；category 为 DINING/TRANSPORT/TICKET/LODGING/SHOPPING/OTHER；occurredOn 有效 YYYY-MM-DD；payerMemberId 为同账本成员；note 可省略/null/≤500；receiptImageId 可省略/null/UUID，必须本人上传未绑定 RECEIPT |
| A13 分摊    | splitMode 为 EQUAL/SHARES/AMOUNT；splits 1–12 个不重复的同账本成员。EQUAL `{memberId}`；SHARES `{memberId,shares}`，整数 1–10000；AMOUNT `{memberId,amountCents}`，非负分字符串、合计严格等于总额。记录人、付款人、分摊人分别保存                            |
| A14         | from≤to（可各自省略），payerMemberId UUID、category 枚举；筛选取交集；分页规则同上                                                                                                                                                                           |
| A18         | 文本 kind=COVER/RECEIPT、ledgerId 可省略；文件名字段 file，仅一张 JPEG/PNG，≤1048576 字节、每边≤4096、≤1600 万像素，实际解码/MIME 校验，不接受动画多页；仅上传不会提前绑定                                                                                   |
| A23         | expectedVersion 为 1–2147483647 整数，取最新 A22.ledgerVersion，不能使用消费 version 或自行加一                                                                                                                                                              |
| A25         | note 可省略，最多 200 字；不接受金额、部分登记、撤销或其他状态字段                                                                                                                                                                                           |

请求严格对象不接受额外字段的范围见各 Schema（消费、建账、邀请、认证、图片 metadata、登记、冻结）；query 不应自行拼接未知字段。

## 成功响应字段核对

下列类型都是 `data` 内部形状；`?` 表示可省略，`null` 表示字段存在且可空。完整 Zod 定义是可执行依据。

| 类型                      | 字段                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UserSelf / TokenPair      | UserSelf：`id,username,email,notificationEnabled`；TokenPair：`accessToken,accessTokenExpiresAt,refreshToken,refreshTokenExpiresAt`                                                                                                                                                                                    |
| LedgerSummary             | `id,name,coverKey(null或枚举),coverImageId(null或UUID),status,version,memberCount,expenseTotalCents,myRemainingNetCents,archivedAt(null或时间),createdAt`                                                                                                                                                              |
| LedgerDetail / Member     | Detail 在 Summary 上增加 `creatorUserId,myMemberId,myPaidCents,mySharedCents,myNetCents,members`；Member：`id,userId,username,role(CREATOR/MEMBER),joinedAt,netCents,remainingNetCents`                                                                                                                                |
| Invitation / JoinPreview  | Invitation：`id,code,expiresAt,expired,qrPayload`；Preview：`ledgerId,name,creatorName,memberCount,alreadyMember,canJoin`，不泄露财务流水                                                                                                                                                                              |
| ExpenseSummary            | `id,title,amountCents,category,occurredOn,payerMemberId,payerName,version`                                                                                                                                                                                                                                             |
| ExpenseDetail             | Summary + `ledgerId,recorderMemberId,recorderName,splitMode,splits,note(null),receiptImageId(null),createdAt,updatedAt,canEdit`；split：`memberId,username,shares(null或整数),amountCents`                                                                                                                             |
| UploadedImage             | `imageId,mimeType,byteSize,width,height`；字节及宽高为整数，二进制不在此响应中                                                                                                                                                                                                                                         |
| MemberBalance             | `memberId,username,paidCents,sharedCents,netCents,remainingNetCents`；净额正为应收、负为应付                                                                                                                                                                                                                           |
| Statistics（A21，仅契约） | `expenseTotalCents,categories:[{category,amountCents,percentage}],members:[{memberId,paidCents,sharedCents}]`；percentage 为百分数字符串；实际 501，不返回统计结果                                                                                                                                                     |
| SettlementPreview         | `ledgerId,ledgerVersion,expenseTotalCents,transferTotalCents,transferCount,members,transfers,algorithmVersion`；plan transfer：`sequence,payerMemberId,payeeMemberId,amountCents`，最多 11 笔                                                                                                                          |
| Settlement（A23.batch）   | `id,ledgerId,sourceVersion,expenseTotalCents,transferTotalCents,transferCount,algorithmVersion,createdAt,ledgerStatus,transfers,progress`；transfer 为 plan transfer + `id,status(PENDING/PAID),registeredByMemberId(null),registeredAt(null),registrationNote(null)`；progress：`paidCount,totalCount,remainingCents` |
| SettlementDetails（A24）  | Settlement + `netSnapshot:[{memberId,netCents}]`，**直接位于 data，不是 data.batch**。读取冻结快照与最新登记进度，不重新生成批次                                                                                                                                                                                       |

来源：[认证](../packages/contracts/src/auth.ts)、[账本](../packages/contracts/src/ledgers.ts)、[邀请](../packages/contracts/src/invitations.ts)、[消费](../packages/contracts/src/expenses.ts)、[图片](../packages/contracts/src/images.ts)、[余额](../packages/contracts/src/balances.ts)、[结算](../packages/contracts/src/settlements.ts)、[标量](../packages/contracts/src/scalars.ts)、[HTTP envelope](../packages/contracts/src/http.ts)。

## 状态、冲突与明确恢复

ACTIVE → SETTLING → SETTLED。建账 version 1，首次加入和新增消费递增账本版本；正式冻结递增，创建者结清递增；重置邀请码、登记已还和个人归档不递增账本版本。A22 只预览，A23 才保存唯一正式批次并冻结；零笔转账保存批次后直接 SETTLED。

A25 只改变转账登记与剩余净额，不修改原消费、分摊、原净额、原垫付/应摊或批次快照。所有转账 PAID 后仍需 A26；不能将登记当作新增消费抵账。A27 只写本人 ledger_members.archivedAt，不改财务状态/版本、不影响其他成员和原批次；历史读取仍鉴权。

| code / HTTP                                                | 语义与恢复                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| VALIDATION_ERROR / 400                                     | 检查字段、金额字符串、成员 ID、body 是否应省略、幂等键 UUID；不能用用户 ID 替代成员 ID                                                          |
| UNAUTHENTICATED / 401；FORBIDDEN / 403                     | 失效清除凭据，经门禁同账号登录且在线核验后恢复原尝试；换账号清除。非成员/非创建者/不具备登记角色不能靠重试获得权限，不存在账本/图片也可统一 403 |
| INVITE_INVALID / 400，INVITE_EXPIRED / 409                 | 预览/加入码不存在、已重置或过期，联系创建者；A09 无当前邀请为 409 INVITE_INVALID。已有成员使用未撤销过期码可进入                                |
| MEMBER_LIMIT_REACHED / 409，LEDGER_FROZEN / 409            | 非成员确认加入时满员/冻结；预览通常 200 canJoin:false。消费/重置邀请遇冻结不能继续写                                                            |
| VERSION_CONFLICT / 409                                     | A23 预览已过期，App「重新查询账本与预览」后核对新方案再确认；禁止自行加一旧版本。A16/A17 的 version 目前只有契约，不能宣称编辑冲突已实现        |
| IDEMPOTENCY_CONFLICT / 409                                 | 原键内容不同，核对原提交，不能换键重复写入。未知结果后的确定失败也不证明前次未成功                                                              |
| LEDGER_STATE_INVALID / 409；SETTLEMENT_INCOMPLETE / 409    | 归档需 SETTLED；结清需已冻结、全部登记且每位剩余净额 0；读取当前状态后按正确流程操作                                                            |
| NOT_FOUND / SETTLEMENT_NOT_FOUND / TRANSFER_NOT_FOUND，404 | 分别为消费或接口、正式批次、转账不存在；核对资源与时机                                                                                          |
| IMAGE_INVALID / 400，PAYLOAD_TOO_LARGE / 413               | 图片类型/绑定/解码不合法或超限；权限仍可能返回 403，重新选择可用图片                                                                            |
| RATE_LIMITED / 429                                         | 稍后显式重试；不能通过自动循环重复写入                                                                                                          |
| NOT_IMPLEMENTED / 501                                      | A16/A17/A21/A28/A29 边界；不按网络故障无限重试                                                                                                  |

实现证据：[HTTP 适配](../apps/server/src/http/operation.ts)、[事务幂等](../apps/server/src/db/idempotency.ts)、[账本](../apps/server/src/modules/ledgers/service.ts)、[邀请](../apps/server/src/modules/invitations/service.ts)、[消费](../apps/server/src/modules/expenses/service.ts)、[图片](../apps/server/src/modules/images/service.ts)、[正式冻结](../apps/server/src/modules/settlements/start.ts)、[登记/结清](../apps/server/src/modules/settlements/progress.ts)、[在线确认面板](../apps/mobile/src/components/OnlineWriteSheet.tsx)。权限、冲突和未知结果的既有自动化/异常原生证据见 [#48](issue48-native-candidate-validation.md) 与 [#46/#47](issues46-47-acceptance.md)，保留原来源版本；#49 只重做完整正常 App 路径，不能冒充重验了每个错误码。
