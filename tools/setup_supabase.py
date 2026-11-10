# -*- coding: utf-8 -*-
"""One-time local setup for the Supabase backend (Route B).

Usage:
  python tools/setup_supabase.py

It reads (or asks for) SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF /
SUPABASE_DB_PASSWORD, then:
  1. logs the Supabase CLI in (local CLI state under ./.supabase-home)
  2. applies supabase/migrations/*.sql to the remote database
  3. fetches the project URL + anon/service keys via the Management API
  4. seeds the 9,058 terms + 32 patterns
  5. verifies anonymous access is blocked and the data is readable

Secrets are written to .env.local (gitignored) and never printed.
"""
import getpass
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_common import ROOT, load_env, request, save_env  # noqa: E402

CLI = ROOT / "node_modules" / "supabase" / "dist" / "supabase.js"
MANAGEMENT_API = "https://api.supabase.com/v1"


def ask(env, key, prompt, secret=False):
    value = env.get(key)
    if value:
        return value
    if secret:
        return getpass.getpass(prompt)
    return input(prompt).strip()


def node_cmd():
    node = shutil.which("node")
    if not node:
        raise SystemExit("未找到 node，请先安装 Node.js（https://nodejs.org）")
    if not CLI.exists():
        raise SystemExit("未找到 supabase CLI，请先在项目根目录运行：npm install")
    return [node, str(CLI)]


def run_cli(args, env_extra=None):
    cmd = node_cmd() + args
    shown, skip_next = [], False
    for arg in args:
        if skip_next:
            shown.append("<hidden>")
            skip_next = False
            continue
        shown.append(arg)
        if arg in ("--password", "-p", "--token"):
            skip_next = True
    print("$ supabase " + " ".join(shown))
    env = os.environ.copy()
    env.update(env_extra or {})
    env.setdefault("CI", "true")
    proc = subprocess.run(cmd, cwd=str(ROOT), env=env, text=True, input="y\n",
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    output = proc.stdout or ""
    print(output.strip()[-4000:])
    if proc.returncode != 0:
        raise SystemExit("命令失败：supabase " + " ".join(shown))
    return proc.returncode


def management_get(path, token):
    req = urllib.request.Request(
        MANAGEMENT_API + path,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"Management API 请求失败 {path}: HTTP {exc.code} {body[:500]}")
    except Exception as exc:
        raise SystemExit(f"Management API 请求失败 {path}: {exc}")


def pick_keys(keys_payload):
    items = keys_payload
    if isinstance(keys_payload, dict):
        items = keys_payload.get("keys") or keys_payload.get("api_keys") or []
    anon, service = None, None
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("type") or "").lower()
        value = item.get("api_key") or item.get("key") or item.get("value")
        if not value:
            continue
        if name in ("anon", "publishable", "public") and not anon:
            anon = value
        if name in ("service_role", "secret", "service") and not service:
            service = value
    return anon, service


def main():
    if "--check" in sys.argv:
        checks = []
        checks.append(("supabase CLI", CLI.exists()))
        checks.append(("migration SQL", (ROOT / "supabase" / "migrations" / "20261110000000_init.sql").exists()))
        checks.append(("admin-users function", (ROOT / "supabase" / "functions" / "admin-users" / "index.ts").exists()))
        checks.append(("seed script", (ROOT / "tools" / "seed_terms.py").exists()))
        checks.append(("verify script", (ROOT / "tools" / "verify_supabase.py").exists()))
        env = load_env()
        for key in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD"):
            checks.append((f".env.local {key}", bool(env.get(key))))
        print("本地准备检查：")
        for name, ok in checks:
            print(("PASS  " if ok else "MISS  ") + name)
        sys.exit(0 if all(ok for _, ok in checks) else 1)

    env = load_env()

    if not env.get("SUPABASE_ACCESS_TOKEN"):
        print("\n① 打开 https://supabase.com/dashboard/account/tokens 生成 Personal Access Token（sbp_...）")
    env["SUPABASE_ACCESS_TOKEN"] = ask(env, "SUPABASE_ACCESS_TOKEN", "粘贴 Access Token: ")

    if not env.get("SUPABASE_PROJECT_REF"):
        print("\n② Supabase 项目 → Project Settings → General → Reference ID")
    env["SUPABASE_PROJECT_REF"] = ask(env, "SUPABASE_PROJECT_REF", "粘贴 Project Ref: ")

    if not env.get("SUPABASE_DB_PASSWORD"):
        print("\n③ 数据库密码：Project Settings → Database（忘记可 Reset database password）")
    env["SUPABASE_DB_PASSWORD"] = ask(env, "SUPABASE_DB_PASSWORD", "粘贴数据库密码: ", secret=True)

    token = env["SUPABASE_ACCESS_TOKEN"]
    ref = env["SUPABASE_PROJECT_REF"].strip()
    db_password = env["SUPABASE_DB_PASSWORD"]

    # local CLI state lives inside the repo (gitignored) — avoids writing to the user home.
    home = ROOT / ".supabase-home"
    home.mkdir(parents=True, exist_ok=True)
    cli_env = {"USERPROFILE": str(home), "HOME": str(home)}

    print("\n== 1/5 登录 Supabase CLI ==")
    run_cli(["login", "--token", token], cli_env)

    print("\n== 2/5 应用数据库迁移（建表 + RLS） ==")
    run_cli(["db", "push", "--remote", ref, "--password", db_password, "--include-all", "--yes"], cli_env)

    print("\n== 3/5 读取项目 URL 与 API Keys ==")
    project = management_get(f"/projects/{ref}", token)
    project_url = project.get("url") or f"https://{ref}.supabase.co"
    if not project_url.startswith("http"):
        project_url = f"https://{ref}.supabase.co"
    keys = management_get(f"/projects/{ref}/api-keys?reveal=true", token)
    anon, service = pick_keys(keys)
    if not anon or not service:
        print("无法从 Management API 自动识别 anon/service key，回退到 CLI …")
        try:
            proc = subprocess.run(node_cmd() + ["projects", "api-keys", "--remote", ref, "--reveal", "--output-format", "json"],
                                  cwd=str(ROOT), env={**os.environ, **cli_env, "CI": "true"},
                                  text=True, capture_output=True)
            data = json.loads(proc.stdout)
            anon, service = pick_keys(data)
        except Exception:
            pass
    if not anon or not service:
        raise SystemExit("未能自动获取 API Keys，请从 Dashboard → Project Settings → API 复制到 .env.local")
    print("已获取项目 URL 与 Keys（不显示密钥）")

    env.update({
        "SUPABASE_URL": project_url.rstrip("/"),
        "SUPABASE_ANON_KEY": anon,
        "SUPABASE_SERVICE_ROLE_KEY": service,
    })
    save_env(env)

    print("\n== 4/5 导入词库（9058 词条 + 32 句型） ==")
    subprocess.run([sys.executable, str(ROOT / "tools" / "seed_terms.py")],
                   cwd=str(ROOT), env={**os.environ, **env}, check=True)

    print("\n== 5/5 验证 RLS 与数据 ==")
    subprocess.run([sys.executable, str(ROOT / "tools" / "verify_supabase.py")],
                   cwd=str(ROOT), env={**os.environ, **env}, check=True)

    print("\n完成。已写入 .env.local（含密钥，切勿提交）。")
    print("下一步：第 3 步创建 taize / admin 账户，再进入前端接入。")


if __name__ == "__main__":
    main()
