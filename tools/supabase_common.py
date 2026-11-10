# -*- coding: utf-8 -*-
"""Shared helpers for the one-time Supabase setup scripts (local only)."""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"


def load_env():
    """Priority: real environment variables > .env.local."""
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            env[k.strip()] = v
    for k, v in os.environ.items():
        if k.startswith("SUPABASE_"):
            env[k] = v
    return env


def save_env(values):
    """Rewrite .env.local with the given values (strip secrets from logs)."""
    lines = [
        "# ============================================================",
        "# 日汉术语词典 · local-only settings (never commit)",
        "# ============================================================",
    ]
    for k in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD", "TAIZE_PASSWORD", "ADMIN_PASSWORD",
              "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        if values.get(k):
            lines.append(f"{k}={values[k]}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def require(env, keys):
    missing = [k for k in keys if not env.get(k)]
    if missing:
        raise SystemExit("缺少配置：" + ", ".join(missing) + "（请填写 .env.local）")


def request(method, url, key=None, body=None, headers=None, timeout=90):
    hdrs = dict(headers or {})
    if key:
        hdrs.setdefault("apikey", key)
        # JWT keys (legacy anon/service_role) may be sent as bearer; new sb_* keys use apikey only.
        if key.startswith("eyJ"):
            hdrs.setdefault("Authorization", f"Bearer {key}")
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read().decode("utf-8", "replace")
    except Exception as exc:  # network / DNS / TLS
        raise SystemExit(f"请求失败：{url} -> {exc}")

