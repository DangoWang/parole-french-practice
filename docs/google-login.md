# Google 登录（Vercel）

生产地址：https://parole-french-practice-8chh.vercel.app

必需环境变量：`google_oauth_client_id`、`google_oauth_client_secret`、`MONGODB_URI`。数据库默认 `parole`，可用 `MONGODB_DB` 覆盖。沿用 `PAROLE_SYNC_KEY` 验证旧记录迁移。回调地址必须是 `https://parole-french-practice-8chh.vercel.app/api/auth/callback/google`。可用 `PAROLE_AUTH_ORIGIN` 更换部署域名，同时更新前端 auth.js 的 ORIGIN 和 Google 控制台地址。

登录使用 Google 官方 Node 库，校验 ID Token 签名、受众、有效期及 nonce；一次性 state 绑定浏览器，使用 PKCE。仅请求 openid/email/profile，不申请 Drive、邮件或日历权限。服务端 MongoDB 存会话令牌的 SHA-256 摘要，浏览器使用 Secure/HttpOnly/SameSite=Lax cookie，有效期 30 天；退出删除该会话。Google token 不保留。authFlows 与 authSessions 有 TTL 索引。

Google sub 作为稳定账户标识，study 文档按 google-<sub> 隔离。写入校验来源及当前账户，切换账户后的旧页面不能写入另一账户。浏览器进度、同步元数据和恢复备份也按账户隔离。OpenAI Key 仍只在浏览器，不进入数据库。

首次登录在学习设置选择“迁移我的旧版云端记录”或“从示例句集开始”。迁移需要原同步密钥，单独验证归属；复制 personal 文档，不删除旧数据，不覆盖已有账户数据。同一份旧数据只允许关联一个 Google 账户。迁移后应在登录版继续练习；旧版数据不会自动合并到新账户。迁移前先在旧版完成同步；本地未同步内容可用现有导出/导入备份功能迁移，冲突时先下载备份再选定版本。

旧静态 Sites 页面和同步密钥接口保留兼容，Google 登录在同域 Vercel 版使用。已在生产页面验证 Google 登录回调与旧云端记录迁移，页面确认账户已登录并同步。没有将密钥写入代码。自动化测试覆盖 state 重放、跨站写入、账户隔离和迁移保护。

更新：账户页面已移除旧同步密钥和迁移入口。新账户登录后自动以示例句集初始化并同步；现有账户保留原数据。未登录时不再启用旧密钥同步。旧服务端接口仅保留兼容，不在新版 UI 中提供。
