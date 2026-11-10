# 日汉术语词典 · Web 版（Vite + Supabase）

这是路线 B 的前端：页面本身是纯静态文件，登录后从 Supabase 拉取词库；未登录拿不到任何词条。

## 本地开发

```powershell
cd web
npm install
npm run dev          # http://localhost:5173
```

`web/.env.local` 需要（已在本机生成，不要提交）：

```ini
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
VITE_USER_EMAIL_DOMAIN=dict.local
```

> 根目录 `.env.local` 里保存的是部署/导入用的管理员凭据；`web/.env.local` 只放公开的 URL + publishable/anon key。
> `.env.local` 与 `web/.env.local` 都已被 `.gitignore` 忽略。

账号（Supabase Auth）：用户名 `taize`（一般用户）、`admin`（管理员）。初始密码见本地 `accounts.local.txt` / 项目沟通记录；Supabase 要求密码至少 6 位。

## 构建

```powershell
cd web
npm run build        # 输出到 web/dist/
```

## 部署到 GitHub Pages

仓库根目录已带 `.github/workflows/deploy-web.yml`：

1. GitHub 仓库 → Settings → Pages → Source 选 **GitHub Actions**；
2. Settings → Secrets and variables → Actions → **Variables** 添加：
   - `SUPABASE_URL` = `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = publishable/anon key（公开值可放 Variables）
3. push 到 `main` 就会构建并部署 `web/dist`；
4. 部署完成后，把 Pages 地址（`https://<user>.github.io/<repo>/`）填到 Supabase：
   - Authentication → URL Configuration → Site URL
   - Redirect URLs 追加 `https://<user>.github.io/<repo>/**`
5. 本地开发也可以把 `http://localhost:5173/**` 加进 Redirect URLs。

## 与 Supabase 的对应关系

| 功能 | 实现 |
|---|---|
| 登录 | Supabase Auth（用户名映射为 `username@dict.local`） |
| 词库读取 | 登录后分页读取 `public.terms`（RLS 只允许 authenticated） |
| 增删改 | 直接写 `public.terms`；删除为软删除 `deleted=true` |
| 用户管理 | 调 Edge Function `admin-users`（仅 admin） |
| 导出 | 从内存生成 CSV/JSON（与旧版格式兼容） |
| 导入 | CSV 追加 / JSON 按 id 或 base_id 合并写入 Supabase |
| 收藏 | 目前仍存 localStorage（后续可迁 `favorites` 表） |

## 说明

- 单文件旧版（根目录 `词汇表-在线词典-alpha.html`）保留作离线备份，不再包含云端数据。
- 生产环境建议把 Edge Function 的 `ALLOWED_ORIGIN` 从 `*` 改成 Pages 域名：
  ```powershell
  npx supabase secrets set ALLOWED_ORIGIN=https://<user>.github.io --project-ref <ref>
  ```
  然后在 `supabase/config.toml` 的 functions 配置中仍保持 `verify_jwt = false`（函数内部自己校验 JWT）。
- 如需把用户名登录改成邮箱登录，只需调整 `web/src/main.js` 里的 email 映射和 UI 文案。

