# -*- coding: utf-8 -*-
"""Seed the 9,058 dictionary entries + 32 patterns into Supabase.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local .env.local or env).
Run: python tools/seed_terms.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_common import ROOT, load_env, request, require  # noqa: E402

BATCH = 500


def main():
    env = load_env()
    require(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
    url = env["SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]

    data_file = ROOT / "build" / "data.json"
    if not data_file.exists():
        raise SystemExit("找不到 build/data.json，请先运行 python tools/extract.py")

    payload = json.loads(data_file.read_text(encoding="utf-8"))
    fields = payload["fields"]
    idx = {name: i for i, name in enumerate(fields)}

    rows = []
    for record in payload["rows"]:
        v = record["v"]
        rows.append({
            "base_id": record["id"],
            "ja": v[idx["ja"]],
            "reading": v[idx["reading"]],
            "zh": v[idx["zh"]],
            "en": v[idx["en"]],
            "cats": [c for c in str(v[idx["cats"]]).split(";") if c],
            "note": v[idx["note"]],
            "etym": v[idx["etym"]],
            "variant": v[idx["variant"]],
            "abbr": v[idx["abbr"]],
            "syn": v[idx["syn"]],
            "img": v[idx["img"]],
        })

    print(f"准备导入 {len(rows)} 条词条到 {url}")
    endpoint = url + "/rest/v1/terms?on_conflict=base_id"
    headers = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    started = time.time()
    for offset in range(0, len(rows), BATCH):
        batch = rows[offset:offset + BATCH]
        status, _, body = request("POST", endpoint, key, batch, headers)
        if status not in (200, 201, 204):
            raise SystemExit(f"导入失败（{offset}–{offset + len(batch)}）：HTTP {status} {body[:500]}")
        print(f"  imported {offset + len(batch)}/{len(rows)}")
    print(f"词条导入完成，用时 {time.time() - started:.1f}s")

    patterns = payload["meta"].get("patterns", [])
    if patterns:
        p_endpoint = url + "/rest/v1/patterns?on_conflict=id"
        p_rows = [{"id": p["id"], "ja": p["ja"], "zh": p["zh"], "sort": p["id"]} for p in patterns]
        status, _, body = request("POST", p_endpoint, key, p_rows,
                                  {"Prefer": "resolution=merge-duplicates,return=minimal"})
        if status not in (200, 201, 204):
            raise SystemExit(f"句型导入失败：HTTP {status} {body[:500]}")
        print(f"句型导入完成：{len(p_rows)} 条")

    # verify counts with service role
    for table in ("terms", "patterns"):
        status, headers_out, body = request(
            "GET", f"{url}/rest/v1/{table}?select=id&limit=1", key,
            headers={"Prefer": "count=exact", "Range": "0-0"})
        content_range = headers_out.get("Content-Range", "")
        print(f"  {table}: HTTP {status}, count={content_range.split('/')[-1] if '/' in content_range else '?'}")
    print("完成。")


if __name__ == "__main__":
    main()
