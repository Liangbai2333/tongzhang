# 模块依赖清单

以package.json与唯一pnpm-lock.yaml为安装依据，不独立升级Expo配套React / React Native。Expo已通过安装器对齐SDK 57补丁版本（expo 57.0.31），配套constants、linking、network和router同步对齐。

| 应用   | 依赖                      | 声明版本   | 用途                                      |
| ------ | ------------------------- | ---------- | ----------------------------------------- |
| api    | `@fastify/multipart`      | `^9.4.0`   | images：限制文件大小、数量并读取multipart |
| api    | `@fastify/rate-limit`     | `^10.3.0`  | auth/invitations：限制请求频率            |
| api    | `argon2`                  | `0.45.1`   | auth：密码哈希与校验                      |
| api    | `sharp`                   | `0.35.5`   | images：服务端图片解码、尺寸与格式检查    |
| mobile | `react-hook-form`         | `7.90.0`   | 表单状态与字段错误                        |
| mobile | `@hookform/resolvers`     | `6.0.0`    | Zod表单校验适配                           |
| mobile | `expo-camera`             | `~57.0.6`  | invitations：二维码扫描                   |
| mobile | `expo-image-picker`       | `~57.0.20` | images：相册选图、拍照                    |
| mobile | `expo-image-manipulator`  | `~57.0.21` | images：压缩与尺寸处理                    |
| mobile | `expo-clipboard`          | `~57.0.2`  | 邀请、结算文案复制                        |
| mobile | `expo-sharing`            | `~57.0.24` | 二维码图片的系统分享                      |
| mobile | `expo-file-system`        | `~57.0.7`  | 分享/上传所需临时文件，不作业务离线库     |
| mobile | `expo-crypto`             | `~57.0.4`  | 生成安全UUID幂等键                        |
| mobile | `react-native-svg`        | `15.15.4`  | 线性图标与图表                            |
| mobile | `react-native-qrcode-svg` | `6.3.26`   | 渲染邀请二维码                            |
| mobile | `expo-secure-store`       | `~57.0.4`  | 保存会话原令牌                            |
| mobile | `@tanstack/react-query`   | `5.104.2`  | 在线查询、缓存失效与提交状态              |

## 配置

- multipart：单文件≤1 MiB，最多1个文件、2个文本字段；图片必须由业务服务继续解码和校验用途。
- rate-limit：单进程内存计数；路由按公开认证/受保护操作配置。本项目单实例部署，扩容时再调整共享限流存储。
- 相机仅扫码/拍照，关闭录像麦克风权限；相册与相机授权在用户触发时申请。
- React Native原生Share用于文字分享，expo-sharing用于临时图片文件；不增加中转选择面板。
- pnpm仅允许已登记依赖的构建脚本；argon2需构建本机绑定，Docker构建继续检查可用性。

## 技术依据

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [相机配置](https://docs.expo.dev/versions/v57.0.0/sdk/camera/)
- [图片选择配置](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)
- [Drizzle Schema](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Fastify Multipart](https://github.com/fastify/fastify-multipart)
- [Fastify Rate Limit](https://github.com/fastify/fastify-rate-limit)
