import { supabase } from "./supabase.js";

const FIELDS = ["en", "ja", "reading", "zh", "cats", "freq", "note", "etym", "variant", "abbr", "syn", "img", "owner"];
const DB_COLUMNS = "id,base_id,ja,reading,zh,en,cats,note,etym,variant,abbr,syn,img,deleted,created_by,updated_by,created_at,updated_at";

function splitCats(value) {
  return String(value || "").split(/[;；]/).map((x) => x.trim()).filter(Boolean);
}

function csvCell(value) {
  const s = String(value == null ? "" : value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

function parseCSV(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuote = false;
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (inQuote) {
      if (c === '"') {
        if (s.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuote = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

const HEADER_ALIASES = {
  ja: ["日本語", "日文", "日语", "ja", "japanese", "jp"],
  reading: ["読み方", "读音", "假名", "かな", "reading", "kana"],
  zh: ["中文", "释义", "中文释义", "zh", "chinese", "cn"],
  en: ["english", "英文", "英语", "en"],
  cats: ["领域", "分类", "领域标签", "cats", "category", "categories"],
  note: ["注释", "备注", "備考", "note", "annotation"],
  etym: ["词源", "語源", "etym"],
  variant: ["別表記", "别表记", "变形", "variant"],
  abbr: ["全称/简称", "全称简称", "简称", "abbr", "abbreviation"],
  syn: ["同义词/近义词", "同义词", "近义词", "syn", "synonym"],
  img: ["参考图", "参考图编号", "img", "image"],
};

function headerKey(label) {
  const t = String(label || "").trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(t)) return key;
  }
  return null;
}

export class StoreAdapter {
  constructor(terms) {
    this.raw = terms.slice();
    this.canReset = false;
  }

  setRaw(terms) {
    this.raw = terms.slice();
  }

  rowOf(t) {
    return {
      id: t.id,
      v: [
        t.en || "",
        t.ja || "",
        t.reading || "",
        t.zh || "",
        (t.cats || []).join(";"),
        0,
        t.note || "",
        t.etym || "",
        t.variant || "",
        t.abbr || "",
        t.syn || "",
        t.img || "",
        "",
      ],
    };
  }

  merged() {
    return this.raw.filter((t) => !t.deleted).sort((a, b) => a.id - b.id).map((t) => this.rowOf(t));
  }

  counts() {
    const active = this.raw.filter((t) => !t.deleted);
    return {
      base: active.filter((t) => t.base_id != null).length,
      added: active.filter((t) => t.base_id == null).length,
      edited: active.filter((t) => t.updated_by != null).length,
      deleted: 0,
      total: active.length,
    };
  }

  isCustom(id) {
    const t = this.raw.find((x) => x.id === Number(id));
    return !!(t && t.base_id == null);
  }

  isEdited(id) {
    const t = this.raw.find((x) => x.id === Number(id));
    return !!(t && t.updated_by != null);
  }

  payloadFromFields(fields) {
    return {
      ja: fields.ja,
      reading: fields.reading || null,
      zh: fields.zh || null,
      en: fields.en || null,
      cats: splitCats(fields.cats),
      note: fields.note || null,
      etym: fields.etym || null,
      variant: fields.variant || null,
      abbr: fields.abbr || null,
      syn: fields.syn || null,
      img: fields.img || null,
    };
  }

  async add(fields) {
    const { data, error } = await supabase
      .from("terms")
      .insert(this.payloadFromFields(fields))
      .select(DB_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    this.raw.push(data);
    return data.id;
  }

  async update(id, fields) {
    const { data, error } = await supabase
      .from("terms")
      .update(this.payloadFromFields(fields))
      .eq("id", Number(id))
      .select(DB_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const index = this.raw.findIndex((x) => x.id === Number(id));
    if (index >= 0) this.raw[index] = data;
    else this.raw.push(data);
    return true;
  }

  async remove(id) {
    const { error } = await supabase
      .from("terms")
      .update({ deleted: true })
      .eq("id", Number(id));
    if (error) throw new Error(error.message);
    this.raw = this.raw.filter((x) => x.id !== Number(id));
    return true;
  }

  async refresh() {
    const all = await fetchAllTerms();
    this.setRaw(all);
    return this.raw;
  }

  exportCSV() {
    const columns = [
      ["id", "ID"], ["ja", "日本語"], ["reading", "読み方"], ["zh", "中文"],
      ["en", "English"], ["cats", "领域"], ["note", "注释"], ["etym", "词源"],
      ["variant", "別表記"], ["abbr", "全称/简称"], ["syn", "同义词/近义词"], ["img", "参考图"],
    ];
    const lines = [csvRow(columns.map((c) => c[1]))];
    this.merged().forEach((row) => {
      const obj = {};
      FIELDS.forEach((f, i) => { obj[f] = row.v[i]; });
      lines.push(csvRow(columns.map((c) => obj[c[0]])));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  exportJSON() {
    const entries = this.merged().map((row) => {
      const raw = this.raw.find((t) => t.id === row.id) || {};
      const obj = { id: row.id, base_id: raw.base_id ?? null };
      FIELDS.forEach((f, i) => {
        if (f === "owner" || f === "freq") return;
        obj[f] = row.v[i];
      });
      return obj;
    });
    return JSON.stringify({
      format: "ri-han-dict",
      version: 2,
      exportedAt: new Date().toISOString(),
      total: entries.length,
      entries,
    }, null, 2);
  }

  async importCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { ok: false, error: "CSV 为空或无法解析" };
    const headers = rows[0].map(headerKey);
    if (headers.indexOf("ja") === -1) return { ok: false, error: "CSV 缺少「日本語」列" };

    const existing = new Set(this.raw.filter((t) => !t.deleted).map((t) => `${t.ja}\u0001${t.zh || ""}`));
    const batch = [];
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const src = {};
      headers.forEach((key, c) => { if (key) src[key] = rows[i][c]; });
      if (!String(src.ja || "").trim()) { skipped++; continue; }
      const dedupe = `${String(src.ja).trim()}\u0001${String(src.zh || "").trim()}`;
      if (existing.has(dedupe)) { skipped++; continue; }
      existing.add(dedupe);
      batch.push(this.payloadFromFields(src));
    }
    if (!batch.length) return { ok: true, added: 0, skipped };
    const { data, error } = await supabase.from("terms").insert(batch).select(DB_COLUMNS);
    if (error) throw new Error(error.message);
    this.raw.push(...data);
    return { ok: true, added: data.length, skipped };
  }

  async importJSON(text) {
    let payload;
    try { payload = JSON.parse(text); } catch (e) { return { ok: false, error: "JSON 解析失败" }; }
    const list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.entries) ? payload.entries : null);
    if (!list) return { ok: false, error: "JSON 结构不正确（缺少 entries 数组）" };

    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of list) {
      if (!item || typeof item !== "object" || !String(item.ja || "").trim()) { skipped++; continue; }
      const fields = item;
      let target = null;
      if (item.id && this.raw.some((t) => t.id === Number(item.id))) {
        target = this.raw.find((t) => t.id === Number(item.id));
      } else if (item.base_id && this.raw.some((t) => t.base_id === Number(item.base_id))) {
        target = this.raw.find((t) => t.base_id === Number(item.base_id));
      }
      if (target) {
        const { data, error } = await supabase.from("terms")
          .update(this.payloadFromFields(fields)).eq("id", target.id).select(DB_COLUMNS).single();
        if (error) throw new Error(error.message);
        const index = this.raw.findIndex((t) => t.id === target.id);
        this.raw[index] = data;
        updated++;
      } else {
        const insert = this.payloadFromFields(fields);
        if (item.base_id) insert.base_id = Number(item.base_id);
        const { data, error } = await supabase.from("terms").insert(insert).select(DB_COLUMNS).single();
        if (error) throw new Error(error.message);
        this.raw.push(data);
        added++;
      }
    }
    return { ok: true, added, updated, skipped };
  }
}

export async function fetchAllTerms() {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from("terms")
      .select(DB_COLUMNS)
      .eq("deleted", false)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchPatterns() {
  const { data, error } = await supabase.from("patterns").select("id,ja,zh").order("sort");
  if (error) throw new Error(error.message);
  return data || [];
}
