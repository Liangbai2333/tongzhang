# 工程骨架验收记录

日期：2026-10-13。

| 验证项                  | 结果                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| 工作区                  | 2 个应用 + 2 个共享包，单一 pnpm 锁文件                                    |
| `pnpm check`            | 类型、Lint、格式检查通过                                                   |
| `pnpm test`             | 11 项测试通过                                                              |
| `pnpm test:integration` | 专用 PostgreSQL 测试库，1 项通过                                           |
| `pnpm build:api`        | API 与共享包编译通过                                                       |
| `pnpm mobile:export`    | Android / iOS 的 Hermes JS 包导出通过                                      |
| Expo Doctor             | 21/21 检查通过                                                             |
| 依赖兼容性              | `expo install --check` 通过；`pnpm peers check` 无冲突                     |
| 本机 API                | 3300 端口，存活、数据库就绪、项目约定及 OpenAPI 请求均返回 200             |
| 热更新                  | API 与共享包 watcher 可启动；共享包重新编译触发 API 重启                   |
| 移动端开发服务          | Metro 在 8081 正常启动                                                     |
| Docker                  | 镜像构建通过；容器连接 PostgreSQL，健康检查返回 200；生产 `/docs` 返回 404 |
| 迁移入口                | 本机及容器均可执行；当前无业务表，明确提示暂无迁移                         |
| 配置                    | `.env`、编译结果和依赖目录已忽略；生产 Compose 配置校验通过                |

本机数据库保留运行，数据卷保留；验证用 API、Metro 进程和临时 API 容器已停止。使用 README 的命令重新启动。

未验收：真机/模拟器安装与画面、APK/IPA 构建、云端 CI 执行、真实域名部署。尚未实现业务表、认证、记账、邀请和结算。

依赖基线：Node 24.21.0、pnpm 12.6.0、TypeScript 6.0.3、Expo SDK 57、React 19.2.3、React Native 0.86.3、Fastify 5.12.7、Drizzle ORM 0.45.4、PostgreSQL 17。具体解析版本以锁文件为准。
