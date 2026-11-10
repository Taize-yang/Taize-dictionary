# Supabase 后端搭建说明（路线 B）

本目录已经准备好了 **路线 B（词库全部放 Supabase，静态站点只放 UI）** 所需的全部本地文件：

```
supabase/
├─ config.toml                          # Supabase CLI 配置（已生成）
├─ migrations/20261110000000_init.sql   # 建表 + 索引 + RLS + 触发器 + 权限
└─ functions/admin-users/index.ts       # 管理员增删一般用户（第 3 步部署）
tools/
├─ setup_supabase.py                    # 一键：登录→推送迁移→取 Keys→导入→验证
├─ seed_terms.py                        # 导入 9058 词条 + 32 句型
├─ verify_supabase.py                   # 验证匿名读不到、数据已导入
└─ supabase_common.py
.env.local.example                      # 配置模板（复制为 .env.local）
.gitignore                              # 已忽略 .env.local / .supabase-home
package.json                            # 已安装 supabase CLI（本地 devDependency）
```

**注意：第 2 步只负责数据库和 RLS；账户（第 3 步）和前端改造（第 4–6 步）还没做。** 数据库就绪后再继续下一步。

---

## 你现在只需要做 3 分钟的准备

### 1. 生成 Supabase Personal Access Token

打开：<https://supabase.com/dashboard/account/tokens> → **Generate new token** → 复制 `sbp_...`（只显示一次）。

> 这个 token 等同于你账号的 API 权限，只放在本机 `.env.local`，不要发到群里/提交到 GitHub。

### 2. 找到 Project Ref

Supabase 项目 → **Project Settings → General → Reference ID**，形如 `abcdefghijklmnop`（20 位）。

### 3. 找到数据库密码

**Project Settings → Database → Database password**。

- 记得就直接用；
- 忘了就点 **Reset database password** 生成一个新的（会断开已有连接，个人项目没关系）。

### 4. 填写 `.env.local`（二选一）

**方式 A（最快，推荐）**：在 `dictionary` 目录打开 PowerShell，运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools\fill_supabase_env.ps1
```

按提示依次粘贴 Access Token、Project Ref、数据库密码（密码不回显），它会自动写入 `.env.local`。

**方式 B（手动）**：用记事本打开 `dictionary\.env.local`，填写三行后保存：

```ini
SUPABASE_ACCESS_TOKEN=sbp_你的token
SUPABASE_PROJECT_REF=你的project_ref
SUPABASE_DB_PASSWORD=你的数据库密码
```

> `.env.local` 已被 `.gitignore` 忽略，不会被提交。
> 如果看不到这个文件，把 `.env.local.example` 复制一份改名为 `.env.local`。

### 5. 告诉我「填好了」，或者直接自己跑

**推荐交给我**：你填完后回复一句「填好了」，我直接在本环境执行后面的登录、迁移、导入、验证，并把结果和下一步发给你。

**想自己跑**：在 `dictionary` 目录打开 PowerShell：

```powershell
python tools\setup_supabase.py
```

它会自动完成下面全部步骤（缺配置时也会交互式询问）：

1. `supabase login --token ...`（登录状态保存在本目录 `.supabase-home`，不写你的用户目录）
2. `supabase db push --remote <ref> --password ...` → 建表、索引、RLS、触发器
3. 通过 Management API 读取项目 URL 和 anon/service keys（不显示密钥）
4. `python tools/seed_terms.py` → 导入 9,058 词条 + 32 句型
5. `python tools/verify_supabase.py` → 验证 anon 读不到、service 可读、条数正确

完成后会输出每一张表的检查结果（表是否创建、RLS 是否生效、导入条数）。

---

## 如果你想自己执行

在 `dictionary` 目录打开 PowerShell：

```powershell
python tools\setup_supabase.py
```

脚本会：

- 缺配置时交互式询问 token / ref / 密码；
- 自动设置 CLI 的本地 HOME（避免写 `C:\Users\...\.supabase` 权限问题）；
- 依次登录、推送迁移、获取 keys、导入、验证；
- 把结果写回 `.env.local`（含 URL/anon/service key，切勿提交）。

如果某一步失败，把终端最后 20 行发我（**不要发 token/密码**），我来修。

---

## 这一步完成后的状态

- Supabase 里会有：`profiles`、`terms`、`patterns`、`favorites`、`library_versions` 五张表；
- `terms` 有 9,058 行基础词条，`patterns` 32 行；
- RLS：未登录（anon）什么都读不到；登录用户只读/改词条；`profiles` 只读自己；管理员可读全部（通过 JWT `app_metadata.role`）；
- 数据库密码、PAT、API keys 只在本机 `.env.local` / `.supabase-home`。

## 接下来（第 3 步）

1. 用 Dashboard 手工创建 `taize@dict.local` 和 `admin@dict.local` 两个 Auth 用户；
2. 执行 SQL 写入 `profiles` 并给 admin 设置 `app_metadata.role = 'admin'`；
3. 部署 `admin-users` Edge Function；
4. 验证：一般用户调用 403、管理员可增删一般用户、admin 不可删。

等这步完成后告诉我，我会把第 3 步也做成「一键脚本 + 验证」。

---

## 本次执行结果（2026-11-10）

已通过 `tools/setup_supabase.py` 完成：

| 检查项 | 结果 |
|---|---|
| Supabase 登录 | 成功（CLI 状态在 `./.supabase-home/`） |
| 数据库迁移 | 2 个迁移已应用：建表 + RLS + service_role 授权 |
| `terms` 表 | 9,058 行 |
| `patterns` 表 | 32 行 |
| `profiles` / `favorites` / `library_versions` | 表已创建，当前为空 |
| 匿名（未登录）读取 | 401 拒绝（RLS + 权限生效） |
| 匿名写入 | 401 拒绝 |
| service_role 读取 | 9,058 / 32 正常 |

当前项目：`https://mtycekxuoujmwrrqknzf.supabase.co`

本地已写入 `.env.local`（含 URL、anon key、service key、PAT、数据库密码），已被 `.gitignore` 忽略；`./.supabase-home/` 保存 CLI 登录态。

**下一步（第 3 步）**：创建 `taize`（一般用户）与 `admin`（管理员）账户、写入 `profiles`、给 admin 设置 `app_metadata.role = 'admin'`、部署 `admin-users` Edge Function，并验证权限。

---

## 第 3 步执行结果（2026-11-10）

- Auth：已关闭公开注册（`disable_signup=true`）；密码策略保持 Supabase 最小 6 位。
- 账户（已创建并验证）：
  - 一般用户：`taize`（密码见本地 `accounts.local.txt`；原 `taize` 只有 5 位，Supabase 强制 ≥6，故追加为 6 位）
  - 管理员：`admin`（密码见本地 `accounts.local.txt`，同上原因）
- `profiles`：2 行（taize=user、admin=admin）；管理员角色写在 Auth 的 `app_metadata.role`。
- Edge Function：`admin-users` 已部署（verify_jwt=false，函数内部校验 JWT 与管理员角色）。
- 权限验证全部通过：
  - taize 登录成功，只能读取自己的 profile（RLS 生效）
  - 一般用户调用 `admin-users` → 403
  - admin 可列出用户、新增一般用户、新用户可登录、可删除该用户
  - 删除 admin 被拒绝（400）
- 临时测试用户已清理，`profiles` 仍为 taize + admin 两人。

下一步（第 4 步）：前端接入 Supabase（登录、拉取词库、CRUD 写库），然后第 5 步数据层、第 6 步 GitHub Pages 发布。


---

## 第 4–5 步执行结果（2026-11-10）

前端已重构为 Vite 工程（`web/`），并接通 Supabase：

- 登录：Supabase Auth（用户名映射 `username@dict.local`）
- 词库：登录后从 `public.terms` 分页拉取 9,058 条 + `patterns` 32 条；未登录接口 401
- 增删改：直接写 Supabase（删除为软删除）
- 用户管理：调用已部署的 `admin-users` Edge Function
- 导入/导出：CSV / JSON（与旧版兼容），写回数据库
- 构建：`cd web && npm run build` → `web/dist`（index.html 15 KB + assets）
- 本地 E2E（真实 Chrome + 真实 Supabase）已通过：登录/错误密码、9058 条加载、搜索、详情、收藏、CRUD、管理员用户管理、数据页、移动端 390、0 console。

开发/构建命令见 `web/README.md`。

## 第 6 步：还剩 GitHub Pages 发布

仓库根目录已准备好 `.github/workflows/deploy-web.yml`：

1. 在 GitHub 仓库 Settings → Pages → Source 选择 **GitHub Actions**；
2. Settings → Secrets and variables → Actions → **Variables** 添加 `SUPABASE_URL`、`SUPABASE_ANON_KEY`；
3. push 到 `main` 自动部署 `web/dist`；
4. 把生成的 Pages 地址填到 Supabase Authentication → URL Configuration（Site URL / Redirect URLs）。

需要你提供：GitHub 仓库地址（或你自行把 `dictionary` 目录推到仓库），以及部署后的 Pages 地址，我来完成 Auth URL 配置和线上验收。
