# -*- coding: utf-8 -*-
"""Verify that anonymous access is blocked and seeded data is readable by service role.

Run: python tools/verify_supabase.py
Exit code 0 = all checks passed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_common import load_env, request, require  # noqa: E402


def main():
    env = load_env()
    require(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"])
    url = env["SUPABASE_URL"].rstrip("/")
    anon = env["SUPABASE_ANON_KEY"]
    service = env["SUPABASE_SERVICE_ROLE_KEY"]

    failures = []

    # 1) anonymous SELECT must not return any row
    status, _, body = request("GET", f"{url}/rest/v1/terms?select=id,ja&limit=3", anon)
    if status in (401, 403):
        print(f"PASS  anon 读取被拒绝（HTTP {status}）")
    elif status == 200:
        try:
            rows = body.strip()
            is_empty = rows in ("[]", "")
        except Exception:
            is_empty = False
        if is_empty:
            print("PASS  anon 读取返回空（RLS 生效）")
        else:
            failures.append(f"anon 读取返回了数据：{body[:200]}")
            print("FAIL  anon 读取返回了数据（RLS 未生效）")
    else:
        failures.append(f"anon 读取异常 HTTP {status}: {body[:200]}")
        print(f"FAIL  anon 读取异常 HTTP {status}")

    # 2) anonymous INSERT must fail
    status, _, body = request(
        "POST", f"{url}/rest/v1/terms", anon,
        {"ja": "__rls_probe__", "reading": "rls"},
        {"Prefer": "return=minimal"})
    if status in (401, 403):
        print(f"PASS  anon 写入被拒绝（HTTP {status}）")
    elif status in (200, 201, 204):
        failures.append("anon 写入成功了，RLS/权限配置错误")
        print("FAIL  anon 写入成功了")
    else:
        print(f"INFO  anon 写入 HTTP {status}（通常也可接受）")

    # 3) service role can read all seeded rows
    expected = None
    data_file = Path(__file__).resolve().parents[1] / "build" / "data.json"
    if data_file.exists():
        import json
        expected = len(json.loads(data_file.read_text(encoding="utf-8"))["rows"])
    counts = {}
    for table in ("terms", "patterns"):
        status, headers, body = request(
            "GET", f"{url}/rest/v1/{table}?select=id&limit=1", service,
            headers={"Prefer": "count=exact", "Range": "0-0"})
        content_range = headers.get("Content-Range", "")
        count = content_range.split("/")[-1] if "/" in content_range else "?"
        counts[table] = count
        if status not in (200, 206):
            failures.append(f"{table} 查询失败 HTTP {status}: {body[:200]}")
            print(f"FAIL  {table} 查询失败 HTTP {status}")
        else:
            print(f"PASS  {table} 可读，count={count}")

    if expected is not None and counts.get("terms") != str(expected):
        failures.append(f"terms 行数 {counts.get('terms')} != 期望 {expected}")
        print(f"FAIL  terms 行数不匹配：{counts.get('terms')} vs {expected}")
    elif expected is not None:
        print(f"PASS  terms 行数 = {expected}")

    if failures:
        print("\n=== 有失败项 ===")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\n全部通过：数据库已就绪，未登录无法读取词条。")


if __name__ == "__main__":
    main()
