# -*- coding: utf-8 -*-
"""Create the taize (user) and admin (admin) accounts, deploy the admin-users
Edge Function, and verify role-based access.

Prerequisite: Step 2 done (database + RLS). Run: python tools/setup_accounts.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_common import ROOT, load_env, request, require  # noqa: E402

CLI = ROOT / "node_modules" / "supabase" / "dist" / "supabase.js"
MANAGEMENT = "https://api.supabase.com/v1"


def raw(method, url, headers, body=None, timeout=60):
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except Exception as exc:
        raise SystemExit(f"请求失败：{url} -> {exc}")


def mgmt(path, token, method="GET", body=None):
    headers = {"Authorization": f"Bearer {token}"}
    status, text = raw(method, MANAGEMENT + path, headers, body)
    if status >= 300:
        raise SystemExit(f"Management API {path} 失败：HTTP {status} {text[:500]}")
    return json.loads(text) if text.strip() else {}


def auth_headers(service_key):
    return {"apikey": service_key, "Authorization": f"Bearer {service_key}"}


def list_auth_users(url, service):
    status, text = raw("GET", f"{url}/auth/v1/admin/users?per_page=200", auth_headers(service))
    if status >= 300:
        raise SystemExit(f"读取 Auth 用户失败：HTTP {status} {text[:300]}")
    data = json.loads(text)
    return data.get("users", data if isinstance(data, list) else [])


def find_user(users, email):
    email = email.lower()
    for u in users:
        if str(u.get("email", "")).lower() == email:
            return u
    return None


def create_or_update_user(url, service, email, password, role):
    users = list_auth_users(url, service)
    existing = find_user(users, email)
    if existing:
        uid = existing["id"]
        status, text = raw("PUT", f"{url}/auth/v1/admin/users/{uid}", auth_headers(service), {
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
        })
        if status >= 300:
            raise SystemExit(f"更新用户 {email} 失败：HTTP {status} {text[:300]}")
        return uid, "updated"
    status, text = raw("POST", f"{url}/auth/v1/admin/users", auth_headers(service), {
        "email": email,
        "password": password,
        "email_confirm": True,
        "app_metadata": {"role": role},
    })
    if status >= 300:
        raise SystemExit(f"创建用户 {email} 失败：HTTP {status} {text[:400]}")
    return json.loads(text)["id"], "created"


def upsert_profile(url, service, uid, username, role):
    status, _, text = request(
        "POST", f"{url}/rest/v1/profiles?on_conflict=id", service,
        [{"id": uid, "username": username, "role": role}],
        {"Prefer": "resolution=merge-duplicates,return=minimal"})
    if status not in (200, 201, 204):
        raise SystemExit(f"写入 profiles 失败：HTTP {status} {text[:400]}")


def login(url, anon, email, password):
    status, text = raw("POST", f"{url}/auth/v1/token?grant_type=password",
                       {"apikey": anon}, {"email": email, "password": password})
    if status >= 300:
        return None, f"HTTP {status} {text[:300]}"
    return json.loads(text), None


def call_function(url, anon, token, payload):
    status, text = raw("POST", f"{url}/functions/v1/admin-users",
                       {"apikey": anon, "Authorization": f"Bearer {token}"}, payload)
    try:
        body = json.loads(text)
    except Exception:
        body = text
    return status, body


def deploy_function(ref):
    node = shutil.which("node")
    if not node:
        raise SystemExit("未找到 node")
    home = ROOT / ".supabase-home"
    home.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "USERPROFILE": str(home), "HOME": str(home), "CI": "true"}
    args = ["functions", "deploy", "admin-users", f"--remote={ref}", "--no-verify-jwt", "--use-api", "--yes"]
    print("$ supabase " + " ".join(args))
    proc = subprocess.run([node, str(CLI)] + args, cwd=str(ROOT), env=env, text=True,
                          input="y\n", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print((proc.stdout or "").strip()[-3000:])
    if proc.returncode != 0:
        raise SystemExit("Edge Function 部署失败")


def main():
    env = load_env()
    require(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                  "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF"])
    url = env["SUPABASE_URL"].rstrip("/")
    anon = env["SUPABASE_ANON_KEY"]
    service = env["SUPABASE_SERVICE_ROLE_KEY"]

    taize_password = env.get("TAIZE_PASSWORD")
    admin_password = env.get("ADMIN_PASSWORD")
    if not taize_password:
        taize_password = getpass.getpass("taize 密码: ")
    if not admin_password:
        admin_password = getpass.getpass("admin 密码: ")

    token = env["SUPABASE_ACCESS_TOKEN"]
    ref = env["SUPABASE_PROJECT_REF"]

    print("== 1/5 关闭公开注册（密码策略保持 Supabase 默认 ≥6 位） ==")
    mgmt(f"/projects/{ref}/config/auth", token, "PATCH", {
        "disable_signup": True,
    })
    print("Auth 配置已更新：disable_signup=true（密码最小长度保持 6）")

    print("\n== 2/5 创建/更新账户 taize 与 admin ==")
    taize_id, taize_state = create_or_update_user(url, service, "taize@dict.local", taize_password, "user")
    print(f"taize：{taize_state}")
    admin_id, admin_state = create_or_update_user(url, service, "admin@dict.local", admin_password, "admin")
    print(f"admin：{admin_state}")

    print("\n== 3/5 写入 profiles ==")
    upsert_profile(url, service, taize_id, "taize", "user")
    upsert_profile(url, service, admin_id, "admin", "admin")
    print("profiles 已写入（taize=user, admin=admin）")

    print("\n== 4/5 部署 admin-users Edge Function ==")
    deploy_function(ref)

    print("\n== 5/5 验证登录与权限 ==")
    failures = []

    taize, err = login(url, anon, "taize@dict.local", taize_password)
    if not taize:
        failures.append(f"taize 登录失败：{err}")
        print("FAIL  taize 登录失败：", err)
    else:
        print("PASS  taize 登录成功")
        access = taize["access_token"]
        status, _, text = request("GET", f"{url}/rest/v1/profiles?select=username,role", anon,
                                  headers={"Authorization": f"Bearer {access}"})
        if status == 200 and "taize" in text:
            print("PASS  taize 能读取自己的 profile（且 RLS 生效）")
        else:
            failures.append(f"taize profiles 读取失败：HTTP {status} {text[:200]}")
            print(f"FAIL  taize 读取 profile：HTTP {status}")

        status, body = call_function(url, anon, access, {"action": "list"})
        if status == 403:
            print("PASS  一般用户调用 admin-users 被拒绝（403）")
        else:
            failures.append(f"一般用户调用 admin-users 返回 HTTP {status}: {body}")
            print(f"FAIL  一般用户调用 admin-users 返回 HTTP {status}")

    admin, err = login(url, anon, "admin@dict.local", admin_password)
    if not admin:
        failures.append(f"admin 登录失败：{err}")
        print("FAIL  admin 登录失败：", err)
    else:
        print("PASS  admin 登录成功")
        admin_access = admin["access_token"]
        status, body = call_function(url, anon, admin_access, {"action": "list"})
        if status == 200 and body.get("ok"):
            print(f"PASS  admin 可读取用户列表（{len(body.get('users', []))} 个）")
        else:
            failures.append(f"admin 用户列表失败：HTTP {status} {body}")
            print(f"FAIL  admin 用户列表：HTTP {status} {body}")

        temp_name = "qa_tmp_" + str(int(time.time()))
        status, body = call_function(url, anon, admin_access,
                                     {"action": "create", "username": temp_name, "password": "qa1234"})
        if status == 200 and body.get("ok"):
            print(f"PASS  admin 新增一般用户 {temp_name}")
            temp, err = login(url, anon, f"{temp_name}@dict.local", "qa1234")
            if temp:
                print("PASS  新用户可登录")
            else:
                failures.append(f"新用户登录失败：{err}")
                print("FAIL  新用户登录失败")
            status, body = call_function(url, anon, admin_access,
                                         {"action": "delete", "username": temp_name})
            if status == 200 and body.get("ok"):
                print("PASS  admin 删除该一般用户")
            else:
                failures.append(f"删除一般用户失败：HTTP {status} {body}")
                print(f"FAIL  删除一般用户：HTTP {status}")
        else:
            failures.append(f"admin 新增用户失败：HTTP {status} {body}")
            print(f"FAIL  admin 新增用户：HTTP {status} {body}")

        status, body = call_function(url, anon, admin_access,
                                     {"action": "delete", "username": "admin"})
        if status == 400:
            print("PASS  admin 不可删除（400）")
        else:
            failures.append(f"admin 删除保护失败：HTTP {status} {body}")
            print(f"FAIL  admin 删除保护：HTTP {status}")

    if failures:
        print("\n=== 有失败项 ===")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\n第 3 步完成：账户、用户管理函数、权限验证全部通过。")
    print("账户已就绪（密码见 .env.local 的 TAIZE_PASSWORD / ADMIN_PASSWORD）")


if __name__ == "__main__":
    main()


