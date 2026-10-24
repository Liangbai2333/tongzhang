# 成员环境与启动、CI 支持记录

日期：2026-10-24。关联 [Issue #7 / T17](https://github.com/Liangbai2333/tongzhang/issues/7)，使用 `Refs #7`。本轮提供可执行检查工具、启动修复和本机验证；未访问其他成员电脑，不将本机记录写成全体成员环境均通过。

## 本机实际记录

| 项目             | 实际结果                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| 平台             | macOS / arm64；验证宿主为当前共享工作区所在机器                                                   |
| Node             | 24.22.0，仓库固定 24.21.0；满足 Node 24 engine，检查工具明确给 patch 偏差警告，未修改宿主工具版本 |
| pnpm             | 12.6.0，与 packageManager 一致                                                                    |
| Docker / Compose | 29.8.2 / 5.5.1，daemon 可用                                                                       |
| PostgreSQL       | 17.11；127.0.0.1:35432，开发库 tongzhang，仅 SELECT 1 与健康检查                                  |
| API              | http://localhost:3300，/health/ready 返回真实数据库 connected                                     |
| iOS              | Xcode 27.0 (27A266a)，iPhone 17 / iOS 27.0；现有 SDK 57 开发客户端实际登录负向复测                |

实际命令为 `pnpm check:env --ios --json`、`pnpm check:env --tools-only`、`pnpm dev --help` 和通过 Node --run 分发的服务端 check:db。只读检查结果保存为 [checks.json](evidence/environment/checks.json)。`pnpm dev` 在已有 :3300 API 运行时正确拒绝启动并提示端口占用，返回 1；未停止已有 API/Metro，也未重复启动服务。

## 工具与修复

`pnpm check:env` 检查 Node/pnpm、Docker/Compose、服务端配置、真实 PostgreSQL 与移动端 API 地址/健康。`--tools-only` 供无本机 .env 的环境检查工具；`--skip-docker` 可显式跳过 Docker/Compose 探测，普通 CI 组合这两个参数仅检查 Node/pnpm，独立 container 任务实际执行 Compose 配置、镜像构建及容器测试；`--ios` / `--android` 追加对应工具检查，`--json` 便于成员保留结果。报告不输出签名密钥、数据库口令、URL 中的凭据或接口原始响应；失败返回非零。工具不运行 setup、迁移、安装或 adb reverse。

`dev.mjs` 原来直接 spawnSync('pnpm') 执行预检查，在 Windows 的 .cmd 分发上存在已知兼容缺口。现通过当前 Node 的 `--run` 在对应包目录执行脚本，避免把 .cmd 当可直接执行文件；测试覆盖带空格目录和非零退出传播。依据 [Node --run 文档](https://nodejs.org/api/cli.html#--run)。Windows 的完整安装、Metro 交互和退出清理仍需成员本机复测，不能仅凭这些脚本测试宣称通过。

新增工具已加入 CI。常规脚本测试覆盖危险 API 地址拒绝、Node 版本偏差、缺失工具、安全输出及 tools-only 不读取凭据/连接数据库、显式跳过 Docker 时仍检查 Node/pnpm。Docker/Compose 失败仅附退出状态或白名单错误码对应原因，不输出原始 stderr 或异常内容。本轮实际执行 pnpm check、pnpm test、pnpm test:mobile、服务端构建、双端 JS 导出和 Expo Doctor；结果与范围见其他验证记录。

## 实际 CI 故障与结果

- [失败 Checks #21](https://github.com/Liangbai2333/tongzhang/actions/runs/40080865511)：Android 首个表单用例超过默认 5 秒，其他 31 项及容器任务通过。通过 0.5 CPU Linux 冷缓存复现，已用 be8268b 将单项预算设为 15 秒，保留全部断言；同一环境通过。
- [修复后的 push 检查](https://github.com/Liangbai2333/tongzhang/actions/runs/40081300183)及 [pull_request 检查](https://github.com/Liangbai2333/tongzhang/actions/runs/40081303887)：check/container 共 4 项均成功，包含真实数据库与镜像验证。
- [扩展提交 98dcd58 的 pull_request 检查](https://github.com/Liangbai2333/tongzhang/actions/runs/40082889096)：普通 check 任务的宿主 Compose 版本探测失败；当时未记录底层失败原因，不能确定为缺失或超时。两项独立 container 任务均通过真实 Compose 验证。后续将普通任务的探测限制为 Node/pnpm，保留 container 的完整验证和本机默认 Docker/Compose 检查，另补安全诊断原因与回归测试。
- 本轮扩展提交另触发新的 [PR #9 Checks](https://github.com/Liangbai2333/tongzhang/pull/9/checks)，最终状态按当前 head 核对，不把旧提交的绿色结果冒充新版本已通过。

## 成员接力与剩余范围

成员在自己的机器先启动 API，再运行 `pnpm check:env --android --json` 或 `pnpm check:env --ios --json`，附平台、版本、原生安装/启动命令与失败步骤。Windows 使用 `pnpm.cmd`；Android localhost 地址需要明确执行 adb reverse，真机使用局域网 API 地址。具体安装步骤见[成员环境配置](environment-setup.md)。

本轮有 macOS/iOS 原生证据及 Linux CI/容器证据；其他成员机器、Windows 整机与当前版本 Android 原生安装尚未验收。T17 后续仍包括构建安装、原生权限和完整业务候选版验证，不重复认领已验收的 T02，不提前扣整项点数。
