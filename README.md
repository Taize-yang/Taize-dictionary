# 日汉术语词典 · Beta（Vite + Supabase）

基于《词汇表-已补充.xlsx》的日汉术语词典在线版本：**日语为主、中文释义、英文对照**。
前端是纯静态 Vite 应用（可部署 GitHub Pages），登录、词库、权限全部由 Supabase 提供；未登录拿不到任何词条。

**线上地址：<https://taize-yang.github.io/Taize-dictionary/>**

> 本仓库只保存代码与数据库迁移，**不包含 9,058 条词条数据**（数据存放在 Supabase，避免公开仓库泄露词库）。
> 原始词库由管理员通过本地脚本/备份导入 Supabase。

## 功能

- 登录门禁（Supabase Auth，用户名登录）
- 9,058 条日文词条 + 32 条商务句型
- 日语/假名/中文/英文检索、五十音索引、领域筛选
- 词条新增 / 编辑 / 删除（写入 Supabase；已移除「参考图编号」字段）
- 词库 CSV / JSON 导入导出
- 收藏保存到数据库 `favorites`（按用户，可跨设备；旧 localStorage 收藏自动迁移）
- 再次点击同一词条可收起详情，恢复「查一个词」页面
- 商务句型可新增 / 编辑（登录用户）；管理员可多选删除词条与句型
- 管理员额外可新增 / 删除一般用户（Edge Function）
- 登录用户可点击右上角钥匙图标修改自己的密码（无需旧密码）
- 深浅色、响应式

## 仓库结构

```
.github/workflows/deploy-web.yml   # GitHub Pages 自动部署
web/                                # Vite 前端源码
supabase/
 ├─ migrations/                     # 建表 + RLS + 权限
 ├─ functions/admin-users/          # 管理员增删一般用户
 └─ config.toml
tools/                              # 本地测试/导入/部署辅助脚本
SUPABASE_SETUP.md                   # 从零搭建 Supabase 的完整步骤
```

## 本地开发

```powershell
cd web
npm install
# 复制 web/.env.example 为 web/.env.local，填写 Supabase URL + publishable/anon key
npm run dev        # http://localhost:5173
```

`web/.env.local`、根目录 `.env.local`、账号记录等均已被 `.gitignore` 忽略，**不要提交**。

## 部署到 GitHub Pages

1. Settings → Pages → Source 选择 **GitHub Actions**；
2. Settings → Secrets and variables → Actions → Variables 添加：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`（publishable/anon key，可公开）
3. push `main` 自动构建 `web/dist` 并部署；
4. 在 Supabase Authentication → URL Configuration 中填写 Pages 地址：
   - Site URL：`https://<user>.github.io/<repo>/`
   - Redirect URLs：`https://<user>.github.io/<repo>/**`、`http://localhost:5173/**`

## 数据库与账户

见 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)。会创建：

- `profiles` / `terms` / `patterns` / `favorites` / `library_versions`
- RLS：anon 全部拒绝；authenticated 才可读写；admin 由 JWT `app_metadata.role` 判断
- 默认账户（初始密码由管理员设置并妥善保存，不写入仓库）：`taize`（一般用户）、`admin`（管理员）

## 安全边界

- 前端代码公开；**词条数据只在登录后由 Supabase 返回**，匿名 API 返回 401。
- service_role / 数据库密码 / Personal Access Token 只保存在本机 `.env.local` 或 Supabase 后台，绝不进前端或仓库。
- 管理员操作（增删用户）只通过 Edge Function 的服务端密钥执行。




