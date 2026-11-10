/* ============================================================
   术语词典 · Beta — application
   Vanilla JS, no dependencies. Data is embedded by tools/build.py.
   ============================================================ */
(function () {
  "use strict";

  var ROW_H = 76;
  var STORE = {
    theme: "dict.theme",
    favs: "dict.favs",
    recent: "dict.recent"
  };
  var BUILD = window.__BUILD__ || { version: "0.4.0-beta", ts: "", source: "" };
  var PAYLOAD = window.__DICT_PAYLOAD__;
  if (!PAYLOAD || !PAYLOAD.rows || !PAYLOAD.rows.length) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif">数据加载失败：未找到内嵌词库。</div>';
    return;
  }

  /* ---------------- utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function foldKana(s) {
    return String(s || "").replace(/[\u30a1-\u30f6]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }
  function norm(s) {
    try { return foldKana(String(s == null ? "" : s).normalize("NFKC").toLowerCase()); }
    catch (e) { return foldKana(String(s == null ? "" : s).toLowerCase()); }
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  var storage = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem(k);
        return v ? JSON.parse(v) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* file:// may block */ }
    }
  };

  /* ---------------- data: embedded base + local overlay ---------------- */
  var AUTH = window.__AUTH__;
  var DATA = window.__STORE__;
  if (!AUTH || !DATA) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif">初始化失败：缺少账户或词库模块。</div>';
    return;
  }

  var META = PAYLOAD.meta;
  var BASE_ROWS = PAYLOAD.rows;
  var FIELDS = PAYLOAD.fields;
  var collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  var collatorJa = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

  var KANA_ROWS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];

  /* Japanese dictionary order: first kana of the reading decides the あかさたな row. */
  function kanaRowOf(ch) {
    if (!ch) return "他";
    var o = ch.charCodeAt(0);
    if (o >= 0x3041 && o <= 0x304a) return "あ";
    if (o >= 0x304b && o <= 0x3054) return "か";
    if (o >= 0x3055 && o <= 0x305e) return "さ";
    if (o >= 0x305f && o <= 0x3069) return "た";
    if (o >= 0x306a && o <= 0x306e) return "な";
    if (o >= 0x306f && o <= 0x307d) return "は";
    if (o >= 0x307e && o <= 0x3082) return "ま";
    if (o >= 0x3083 && o <= 0x3088) return "や";
    if (o >= 0x3089 && o <= 0x308d) return "ら";
    if (o >= 0x308e && o <= 0x3093) return "わ";
    if (o === 0x3094) return "あ";
    if (o === 0x3095 || o === 0x3096) return "か";
    return "他";
  }

  function letterOf(en) {
    var c = (en || "").charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : "#";
  }

  var entries = [];
  var byId = new Map();
  var sortedByKana = [];
  var sortedByKanaDesc = [];
  var sortedByEn = [];
  var uniqueJa = 0;
  var uniqueEn = 0;
  var catEntries = new Map();
  var CATEGORIES = [];
  var LETTERS = [];
  var counts = { base: 0, added: 0, edited: 0, deleted: 0, total: 0 };

  function compareKana(a, b) {
    return collatorJa.compare(a.rdKey, b.rdKey) ||
      collatorJa.compare(foldKana(a.ja), foldKana(b.ja)) ||
      a.id - b.id;
  }

  function buildData() {
    var merged = DATA.merged();
    var list = [];
    var by = new Map();
    var catMap = new Map();
    var catCount = Object.create(null);
    var letterCount = Object.create(null);
    var jaSet = Object.create(null);
    var enSet = Object.create(null);
    for (var i = 0; i < merged.length; i++) {
      var rec = merged[i];
      var v = rec.v;
      var e = {
        id: rec.id,
        ix: i,
        en: v[0] || "",
        ja: v[1] || "",
        reading: v[2] || "",
        zh: v[3] || "",
        cats: v[4] ? String(v[4]).split(";").filter(Boolean) : [],
        note: v[6] || "",
        etym: v[7] || "",
        variant: v[8] || "",
        abbr: v[9] || "",
        syn: v[10] || "",
        owner: v[11] || "",
        letter: letterOf(v[0] || "")
      };
      e._en = norm(e.en);
      e._ja = norm(e.ja);
      e._rd = norm(e.reading);
      e._zh = norm(e.zh);
      e._note = norm(e.note);
      e._all = e._en + "\u0001" + e._ja + "\u0001" + e._rd + "\u0001" + e._zh + "\u0001" + e._note;
      e.rdKey = foldKana(e.reading) || foldKana(e.ja);
      e.kana = kanaRowOf(e.rdKey.charAt(0));
      e.custom = DATA.isCustom(e.id);
      e.edited = DATA.isEdited(e.id);
      list.push(e);
      by.set(e.id, e);
      if (e.ja) jaSet[e.ja.toLowerCase()] = 1;
      if (e.en) enSet[e.en.toLowerCase()] = 1;
      letterCount[e.letter] = (letterCount[e.letter] || 0) + 1;
      e.cats.forEach(function (c) {
        if (!catMap.has(c)) catMap.set(c, []);
        catMap.get(c).push(e);
        catCount[c] = (catCount[c] || 0) + 1;
      });
    }
    entries = list;
    byId = by;
    catEntries = catMap;
    uniqueJa = Object.keys(jaSet).length;
    uniqueEn = Object.keys(enSet).length;
    sortedByKana = entries.slice().sort(compareKana);
    sortedByKanaDesc = sortedByKana.slice().reverse();
    sortedByEn = entries.slice().sort(function (a, b) {
      return collator.compare(a.en, b.en) || (a.id - b.id);
    });
    CATEGORIES = Object.keys(catCount).map(function (name) {
      return { name: name, count: catCount[name] };
    }).sort(function (a, b) {
      return (b.count - a.count) || a.name.localeCompare(b.name, "zh-Hans-CN");
    });
    LETTERS = Object.keys(letterCount).sort(function (a, b) {
      if (a === "#") return -1;
      if (b === "#") return 1;
      return a.localeCompare(b);
    }).map(function (k) { return [k, letterCount[k]]; });
    counts = DATA.counts();
  }

  /* ---------------- DOM ---------------- */
  var el = {
    search: $("#searchInput"),
    searchClear: $("#searchClear"),
    theme: $("#themeToggle"),
    railToggle: $("#railToggle"),
    rail: $("#rail"),
    railMask: $("#railMask"),
    drawer: $("#drawer"),
    nav: $("#nav"),
    navManage: $("#navManage"),
    navDrawer: $("#navDrawer"),
    catChips: $("#catChips"),
    catChipsDrawer: $("#catChipsDrawer"),
    catExpand: $("#catExpand"),
    catExpandDrawer: $("#catExpandDrawer"),
    filterReset: $("#filterReset"),
    filterResetDrawer: $("#filterResetDrawer"),
    addEntryBtn: $("#addEntryBtn"),
    navUsers: $("#navUsers"),
    navUsersDrawer: $("#navUsersDrawer"),
    list: $("#list"),
    listInner: $("#listInner"),
    listEmpty: $("#listEmpty"),
    emptyTitle: $("#emptyTitle"),
    emptyText: $("#emptyText"),
    emptyChips: $("#emptyChips"),
    resultCount: $("#resultCount"),
    resultUnit: $("#resultUnit"),
    resultSep: $("#resultSep"),
    filterSummary: $("#filterSummary"),
    sortSelect: $("#sortSelect"),
    randomBtn: $("#randomBtn"),
    letterBar: $("#letterBar"),
    viewList: $("#viewList"),
    viewPatterns: $("#viewPatterns"),
    viewStats: $("#viewStats"),
    viewData: $("#viewData"),
    viewUsers: $("#viewUsers"),
    dataCards: $("#dataCards"),
    customList: $("#customList"),
    customCount: $("#customCount"),
    userList: $("#userList"),
    addUserForm: $("#addUserForm"),
    newUserName: $("#newUserName"),
    newUserPass: $("#newUserPass"),
    addUserMsg: $("#addUserMsg"),
    exportCsvBtn: $("#exportCsvBtn"),
    exportJsonBtn: $("#exportJsonBtn"),
    importBtn: $("#importBtn"),
    importFile: $("#importFile"),
    resetDataBtn: $("#resetDataBtn"),
    entryModal: $("#entryModal"),
    entryForm: $("#entryForm"),
    entryModalTitle: $("#entryModalTitle"),
    entryFormHint: $("#entryFormHint"),
    patternList: $("#patternList"),
    patternEmpty: $("#patternEmpty"),
    patternSub: $("#patternSub"),
    statsScroll: $("#statsScroll"),
    detail: $("#detail"),
    detailBody: $("#detailBody"),
    detailEmpty: $("#detailEmpty"),
    detailClose: $("#detailClose"),
    recentBlock: $("#recentBlock"),
    recentList: $("#recentList"),
    navFavCount: $("#navFavCount"),
    navAllCount: $("#navAllCount"),
    navPatternCount: $("#navPatternCount"),
    footTotal: $("#footTotal"),
    footCats: $("#footCats"),
    footBuild: $("#footBuild"),
    userChip: $("#userChip"),
    userAvatar: $("#userAvatar"),
    userName: $("#userName"),
    userRole: $("#userRole"),
    logoutBtn: $("#logoutBtn"),
    changePassBtn: $("#changePassBtn"),
    passwordModal: $("#passwordModal"),
    passwordForm: $("#passwordForm"),
    passwordMsg: $("#passwordMsg"),
    authGate: $("#authGate"),
    loginForm: $("#loginForm"),
    loginUser: $("#loginUser"),
    loginPass: $("#loginPass"),
    loginError: $("#loginError"),
    appHeader: $("#appHeader"),
    appRoot: $("#appRoot"),
    toast: $("#toast"),
    selftestOut: $("#selftest-output")
  };

  /* ---------------- state ---------------- */
  var state = {
    view: "all",
    query: "",
    cats: new Set(),
    sort: "kana",
    selectedId: null,
    cursor: 0,
    favs: new Set(),
    favOrder: [],
    recent: [],
    expandedCats: false,
    editingId: null,
    started: false
  };

  var items = [];
  var itemsVersion = 0;
  var lastPaint = { start: -1, end: -1, version: -1, selected: null };

  /* ---------------- persistence ---------------- */
  (function restore() {
    var theme = storage.get(STORE.theme, null);
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    var dbFavs = DATA.favorites ? DATA.favorites() : null;
    var favs = dbFavs !== null ? dbFavs : storage.get(STORE.favs, []);
    if (Array.isArray(favs)) {
      favs.forEach(function (id) { state.favOrder.push(id); });
      state.favs = new Set(state.favOrder);
    }
    var recent = storage.get(STORE.recent, []);
    if (Array.isArray(recent)) state.recent = recent.slice(0, 8);
  })();

  buildData();
  (function pruneMemory() {
    state.favOrder = state.favOrder.filter(function (id) { return byId.has(id); });
    state.favs = new Set(state.favOrder);
    state.recent = state.recent.filter(function (id) { return byId.has(id); });
    storage.set(STORE.recent, state.recent);
  })();

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("is-show"); }, 1800);
  }

  /* ---------------- highlighting ---------------- */
  function highlight(text, tokens) {
    if (!text) return "";
    if (!tokens || !tokens.length) return esc(text);
    var low = foldKana(String(text).toLowerCase());
    var ranges = [];
    tokens.forEach(function (t) {
      if (!t) return;
      var from = 0, idx;
      while ((idx = low.indexOf(t, from)) !== -1) {
        ranges.push([idx, idx + t.length]);
        from = idx + t.length;
      }
    });
    if (!ranges.length) return esc(text);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    });
    var out = "", pos = 0;
    merged.forEach(function (r) {
      out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }

  /* ---------------- search / filter ---------------- */
  function queryTokens() {
    var q = norm(state.query).trim();
    if (!q) return [];
    return q.split(/\s+/).filter(Boolean);
  }

  function scoreEntry(e, tokens) {
    var s = 0;
    tokens.forEach(function (t) {
      /* Japanese reading and Japanese term are the primary hit signals. */
      if (e._ja === t) s += 1250;
      else if (e._ja.indexOf(t) === 0) s += 760;
      else if (e._ja.indexOf(t) !== -1) s += 440;
      if (e._rd === t) s += 700;
      else if (e._rd.indexOf(t) === 0) s += 390;
      else if (e._rd.indexOf(t) !== -1) s += 240;
      if (e._zh === t) s += 400;
      else if (e._zh.indexOf(t) !== -1) s += 210;
      if (e._en === t) s += 250;
      else if (e._en.indexOf(t) === 0) s += 150;
      else if (e._en.indexOf(" " + t) !== -1 || e._en.indexOf("-" + t) !== -1) s += 110;
      else if (e._en.indexOf(t) !== -1) s += 80;
      if (e._note.indexOf(t) !== -1) s += 30;
    });
    return s - e.ja.length * 0.2;
  }

  function browseBase() {
    if (state.sort === "en") return sortedByEn;
    if (state.sort === "kana-desc") return sortedByKanaDesc;
    return sortedByKana;
  }

  function computeItems() {
    var tokens = queryTokens();
    var base;
    if (state.view === "fav") {
      base = state.favOrder.map(function (id) { return byId.get(id); }).filter(Boolean);
    } else {
      base = browseBase();
    }
    var filtered = base.filter(function (e) {
      if (state.cats.size) {
        var ok = true;
        state.cats.forEach(function (c) { if (e.cats.indexOf(c) === -1) ok = false; });
        if (!ok) return false;
      }
      return true;
    });
    if (tokens.length) {
      filtered = filtered.filter(function (e) {
        return tokens.every(function (t) { return e._all.indexOf(t) !== -1; });
      });
      var scored = filtered.map(function (e) {
        return { e: e, s: scoreEntry(e, tokens) };
      });
      scored.sort(function (a, b) {
        return (b.s - a.s) || (a.e.ja.length - b.e.ja.length) ||
          compareKana(a.e, b.e) || (a.e.id - b.e.id);
      });
      return scored.map(function (x) { return x.e; });
    }
    if (state.view === "fav") return filtered;
    return filtered;
  }

  /* ---------------- list rendering ---------------- */
  function rowHTML(e, tokens) {
    var cats = e.cats.slice(0, 3).join(" · ");
    if (e.cats.length > 3) cats += " +" + (e.cats.length - 3);
    var starred = state.favs.has(e.id);
    return '<div class="row' + (state.selectedId === e.id ? " is-selected" : "") + '" data-id="' + e.id +
      '" role="option" aria-selected="' + (state.selectedId === e.id) + '" style="transform:translateY(' +
      (e._pos * ROW_H) + 'px)">' +
      '<div class="row-main">' +
        '<div class="row-line"><span class="term-ja">' + highlight(e.ja, tokens) +
          (e.reading ? '<span class="reading">' + highlight(e.reading, tokens) + "</span>" : "") +
          "</span></div>" +
        '<div class="row-line"><span class="term-zh">' + highlight(e.zh, tokens) + "</span>" +
          (e.en ? '<span class="term-en">' + highlight(e.en, tokens) + "</span>" : "") +
          (cats ? '<span class="term-cats">' + esc(cats) + "</span>" : "") +
        "</div>" +
      "</div>" +
      '<div class="row-side"><button class="star' + (starred ? " is-on" : "") + '" type="button" data-star="' +
        e.id + '" aria-label="' + (starred ? "取消收藏" : "收藏") + '" title="收藏（F）">' + (starred ? "★" : "☆") +
      "</button></div>" +
    "</div>";
  }

  function paintList(force) {
    var total = items.length;
    var h = el.list.clientHeight || 600;
    var st = el.list.scrollTop;
    var start = Math.max(0, Math.floor(st / ROW_H) - 6);
    var end = Math.min(total, Math.ceil((st + h) / ROW_H) + 6);
    if (!force && lastPaint.start === start && lastPaint.end === end &&
        lastPaint.version === itemsVersion && lastPaint.selected === state.selectedId) return;
    lastPaint = { start: start, end: end, version: itemsVersion, selected: state.selectedId };
    el.listInner.style.height = (total * ROW_H) + "px";
    var tokens = queryTokens();
    var html = "";
    for (var i = start; i < end; i++) {
      var e = items[i];
      e._pos = i;
      html += rowHTML(e, tokens);
    }
    el.listInner.innerHTML = html;
  }

  function schedulePaint() {
    paintList(false);
  }

  function emptySuggestions() {
    var sugg = ["アーキテクチャ", "接头", "治具", "溶接", "かた", "architecture"];
    el.emptyChips.innerHTML = "";
    sugg.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = s;
      b.addEventListener("click", function () { setQuery(s); el.search.focus(); });
      el.emptyChips.appendChild(b);
    });
  }

  function updateToolbar() {
    el.resultCount.textContent = fmt(items.length);
    el.resultUnit.textContent = state.view === "fav" ? "收藏" : "词条";
    var parts = [];
    state.cats.forEach(function (c) { parts.push('<span class="sum-chip">' + esc(c) + "</span>"); });
    el.filterSummary.innerHTML = parts.join("");
    var hasFilter = state.cats.size > 0;
    if (el.resultSep) el.resultSep.hidden = parts.length === 0;
    [el.filterReset, el.filterResetDrawer].forEach(function (b) { if (b) b.hidden = !hasFilter; });
    el.emptyChips.hidden = false;
    if (items.length === 0) {
      el.listEmpty.hidden = false;
      if (state.view === "fav" && !state.query.trim() && !hasFilter) {
        el.emptyTitle.textContent = "还没有收藏词条";
        el.emptyText.textContent = "点击词条右侧的 ☆（或按 F 键）即可收藏，收藏会保存在本机浏览器中。";
        el.emptyChips.hidden = true;
      } else {
        el.emptyTitle.textContent = "没有找到匹配的词条";
        el.emptyText.textContent = "试试更短的关键词，或换一种语言（日本語 / かな / 中文 / 英文）。";
        el.emptyChips.hidden = false;
        emptySuggestions();
      }
    } else {
      el.listEmpty.hidden = true;
    }
    renderLetters();
  }

  function renderLetters() {
    var browse = state.view === "all" && !state.query.trim() && items.length > 0;
    el.letterBar.hidden = !browse;
    if (!browse) return;
    var useEn = state.sort === "en";
    el.letterBar.setAttribute("aria-label", useEn ? "英文字母索引" : "五十音索引");
    var order = useEn ? LETTERS.map(function (p) { return p[0]; }) : KANA_ROWS.slice();
    if (state.sort === "kana-desc") order.reverse();
    var present = {};
    for (var i = 0; i < items.length; i++) {
      present[useEn ? items[i].letter : items[i].kana] = true;
    }
    var html = "";
    order.forEach(function (key) {
      var dis = present[key] ? "" : " is-empty";
      var label = key === "#" ? "·" : key;
      html += '<button type="button" class="letter' + dis + '" data-group="' + esc(key) + '" title="' +
        esc(key === "#" ? "其他" : key + "行") + '"><span>' + esc(label) + "</span></button>";
    });
    el.letterBar.innerHTML = html;
  }

  function refresh(resetScroll) {
    items = computeItems();
    itemsVersion++;
    state.cursor = Math.min(state.cursor, Math.max(0, items.length - 1));
    if (resetScroll) { el.list.scrollTop = 0; }
    updateToolbar();
    lastPaint.version = -1;
    paintList(true);
    if (state.selectedId && !byId.has(state.selectedId)) state.selectedId = null;
  }

  /* ---------------- filters UI ---------------- */
  function renderChips(container, expanded) {
    var list = expanded ? CATEGORIES : CATEGORIES.slice(0, 14);
    var html = "";
    list.forEach(function (c) {
      var on = state.cats.has(c.name) ? " is-on" : "";
      html += '<button type="button" class="chip' + on + '" data-cat="' + esc(c.name) +
        '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(c.name) +
        ' <span class="chip-n">' + fmt(c.count) + "</span></button>";
    });
    if (!expanded && CATEGORIES.length > 14) {
      html += '<button type="button" class="chip is-more" data-cat-expand="1">+' +
        (CATEGORIES.length - 14) + "</button>";
    }
    container.innerHTML = html;
  }

  function renderAllChips() {
    renderChips(el.catChips, state.expandedCats);
    renderChips(el.catChipsDrawer, state.expandedCats);
    [el.catExpand, el.catExpandDrawer].forEach(function (b) {
      if (!b) return;
      b.textContent = state.expandedCats ? "收起" : "展开";
      b.setAttribute("aria-expanded", state.expandedCats ? "true" : "false");
    });
  }

  function toggleCat(name) {
    if (state.cats.has(name)) state.cats.delete(name);
    else state.cats.add(name);
    renderAllChips();
    refresh(true);
  }

  function clearFilters() {
    state.cats.clear();
    renderAllChips();
    refresh(true);
  }

  /* ---------------- detail ---------------- */
  var openDetailAnimation = 0;

  function detailRow(label, value, hint) {
    if (!value) return "";
    return "<div class=\"detail-row\"><dt>" + esc(label) + "</dt><dd>" + esc(value) +
      (hint ? '<span class="en-hint">' + esc(hint) + "</span>" : "") + "</dd></div>";
  }

  function relatedEntries(e, limit) {
    var scores = new Map();
    e.cats.forEach(function (c) {
      (catEntries.get(c) || []).forEach(function (o) {
        if (o.id === e.id) return;
        var arr = scores.get(o) || 0;
        scores.set(o, arr + 1);
      });
    });
    var arr = Array.from(scores.keys());
    arr.sort(function (a, b) {
      return (scores.get(b) - scores.get(a)) || compareKana(a, b);
    });
    return arr.slice(0, limit);
  }

  function renderDetail(e) {
    state.selectedId = e.id;
    var tokens = queryTokens();
    var catsHtml = e.cats.map(function (c) {
      return '<span class="eyebrow-chip">' + esc(c) + "</span>";
    }).join("");
    if (e.custom) catsHtml += '<span class="eyebrow-chip">自定义</span>';
    else if (e.edited) catsHtml += '<span class="eyebrow-chip">已修改</span>';

    var grid = "";
    grid += detailRow("词源", e.etym);
    grid += detailRow("別表記", e.variant, "写法变形");
    grid += detailRow("全称 / 简称", e.abbr);
    grid += detailRow("同义词 / 近义词", e.syn);

    var related = relatedEntries(e, 8);
    var relatedHtml = related.length ? related.map(function (o) {
      return '<button type="button" class="related-chip" data-open="' + o.id + '"><span class="r-ja">' +
        esc(o.ja) + '</span><span class="muted">' + esc(o.zh || "") + "</span></button>";
    }).join("") : '<span class="muted" style="font-size:12.5px">暂无同领域词条</span>';

    var starred = state.favs.has(e.id);
    var html =
      '<div class="detail-eyebrow">' + catsHtml + "</div>" +
      '<h2 class="detail-ja">' + highlight(e.ja, tokens) + "</h2>" +
      (e.reading ? '<div class="detail-reading">' + highlight(e.reading, tokens) + "</div>" : "") +
      (e.zh ? '<div class="detail-zh">' + highlight(e.zh, tokens) + "</div>" : "") +
      (e.en ? '<div class="detail-en">' + highlight(e.en, tokens) + "</div>" : "") +
      '<div class="detail-actions">' +
        '<button class="btn primary" type="button" data-copy="' + e.id + '">复制</button>' +
        '<button class="btn' + (starred ? " is-on" : "") + '" type="button" data-fav="' + e.id + '">' +
          (starred ? "★ 已收藏" : "☆ 收藏") + "</button>" +
        '<button class="btn" type="button" data-edit="' + e.id + '">编辑</button>' +
        '<button class="btn danger" type="button" data-delete="' + e.id + '">删除</button>' +
      "</div>" +
      (grid ? '<dl class="detail-grid">' + grid + "</dl>" : "") +
      '<section class="detail-note"><h3 class="section-label">注释</h3>' +
        (e.note ? "<p>" + highlight(e.note, tokens) + "</p>" : '<p class="no-note">暂无注释。</p>') +
      "</section>" +
      '<section class="detail-related"><h3 class="section-label">同领域</h3><div class="related-list">' +
        relatedHtml + "</div></section>" +
      '<div class="detail-footnote">' + (e.custom ? "自定义词条" : "词条") + " #" + e.id +
        " · 共 " + e.cats.length + " 个领域标签</div>";

    el.detailBody.innerHTML = html;
    el.detailBody.hidden = false;
    el.detailEmpty.hidden = true;
    el.detail.scrollTop = 0;

    var isNarrow = window.matchMedia("(max-width: 1080px)").matches;
    if (isNarrow) el.detail.classList.add("is-open");

    updateSelection();
  }

  function updateSelection() {
    $$(".row", el.listInner).forEach(function (row) {
      var on = Number(row.getAttribute("data-id")) === state.selectedId;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", on ? "true" : "false");
    });
    lastPaint.selected = state.selectedId;
  }

  function openWord(id, opts) {
    var e = byId.get(id);
    if (!e) return;
    opts = opts || {};
    // 再次点击同一个词条：收起详情，恢复「查一个词」空状态
    if (state.selectedId === id && !opts.force) {
      state.selectedId = null;
      state.cursor = -1;
      showDetailEmpty();
      updateSelection();
      return;
    }
    state.selectedId = id;
    var idx = items.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) state.cursor = idx;
    renderDetail(e);
    pushRecent(id);
    if (opts.scroll !== false && idx >= 0) scrollToIndex(idx);
  }

  function scrollToIndex(idx) {
    var h = el.list.clientHeight;
    var top = idx * ROW_H;
    var target = Math.max(0, top - (h - ROW_H) / 2);
    el.list.scrollTop = target;
    schedulePaint();
  }

  function pushRecent(id) {
    state.recent = [id].concat(state.recent.filter(function (x) { return x !== id; })).slice(0, 8);
    storage.set(STORE.recent, state.recent);
    renderRecent();
  }

  function renderRecent() {
    var list = state.recent.map(function (id) { return byId.get(id); }).filter(Boolean);
    el.recentBlock.hidden = list.length === 0;
    el.recentList.innerHTML = list.map(function (e) {
      return '<button type="button" class="chip" data-recent="' + e.id + '">' + esc(e.en) + "</button>";
    }).join("");
  }

  function showDetailEmpty() {
    el.detailBody.hidden = true;
    el.detailEmpty.hidden = false;
    el.detail.classList.remove("is-open");
    renderRecent();
  }

  /* ---------------- favorites ---------------- */
  function toggleFav(id, silent) {
    var on = state.favs.has(id);
    var prevOrder = state.favOrder.slice();
    if (on) {
      state.favs.delete(id);
      state.favOrder = state.favOrder.filter(function (x) { return x !== id; });
    } else {
      state.favs.add(id);
      state.favOrder = [id].concat(state.favOrder);
    }
    updateFavUI(id, !on);
    el.navFavCount.textContent = fmt(state.favs.size);
    if (!silent) toast(on ? "已取消收藏" : "已加入收藏");
    if (DATA.setFavorite) {
      Promise.resolve(DATA.setFavorite(id, !on)).catch(function () {
        if (on) { state.favs.add(id); state.favOrder = prevOrder; }
        else { state.favs.delete(id); state.favOrder = prevOrder; }
        updateFavUI(id, on);
        el.navFavCount.textContent = fmt(state.favs.size);
        toast("收藏同步失败，请检查网络");
        if (state.view === "fav") refresh(true);
      });
    }
    if (state.view === "fav") refresh(true);
    return !on;
  }

  function updateFavUI(id, on) {
    $$('.star[data-star="' + id + '"]', el.listInner).forEach(function (b) {
      b.classList.toggle("is-on", on);
      b.textContent = on ? "★" : "☆";
      b.setAttribute("aria-label", on ? "取消收藏" : "收藏");
    });
    var favBtn = el.detailBody.querySelector('[data-fav="' + id + '"]');
    if (favBtn) {
      favBtn.classList.toggle("is-on", on);
      favBtn.textContent = on ? "★ 已收藏" : "☆ 收藏";
    }
  }

  /* ---------------- copy ---------------- */
  function entryToText(e) {
    var lines = [];
    if (e.ja) lines.push(e.ja + (e.reading ? "（" + e.reading + "）" : ""));
    if (e.zh) lines.push(e.zh);
    if (e.en) lines.push(e.en);
    if (e.cats.length) lines.push("领域：" + e.cats.join(" / "));
    if (e.etym) lines.push("词源：" + e.etym);
    if (e.variant) lines.push("別表記：" + e.variant);
    if (e.abbr) lines.push("全称/简称：" + e.abbr);
    if (e.syn) lines.push("近义词：" + e.syn);
    if (e.note) lines.push("注释：" + e.note);
    return lines.join("\n");
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(fallbackCopy(text)); });
          return;
        }
      } catch (e) { /* fall through */ }
      resolve(fallbackCopy(text));
    });
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------------- patterns ---------------- */
  function patternCards(patterns, tokens) {
    return patterns.map(function (p) {
      return '<article class="pattern-card">' +
        '<span class="pattern-no">NO. ' + pad2(p.id) + "</span>" +
        '<div class="pattern-ja">' + highlight(p.ja, tokens) + "</div>" +
        '<div class="pattern-zh">' + highlight(p.zh, tokens) + "</div>" +
        '<button class="pattern-copy" type="button" data-copy-pattern="' + p.id + '" aria-label="复制句型" title="复制">⧉</button>' +
      "</article>";
    }).join("");
  }

  function filterPatterns() {
    var all = META.patterns || [];
    var tokens = queryTokens();
    var patterns = all;
    if (tokens.length) {
      patterns = all.filter(function (p) {
        var hay = norm(p.ja) + "\u0001" + norm(p.zh);
        return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
      });
    }
    el.patternList.innerHTML = patternCards(patterns, tokens);
    el.patternList.hidden = patterns.length === 0;
    el.patternEmpty.hidden = patterns.length > 0;
    el.patternSub.textContent = tokens.length
      ? "匹配 " + fmt(patterns.length) + " / " + fmt(all.length) + " 条"
      : "邮件与交涉中常用的日语句型，共 " + fmt(all.length) + " 条 · 点击右上角复制";
  }

  /* ---------------- stats ---------------- */

  function barRow(name, count, max) {
    var pct = max > 0 ? Math.max(1.5, (count / max) * 100) : 0;
    return '<div class="bar-row"><span class="bar-name" title="' + esc(name) + '">' + esc(name) + "</span>" +
      '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
      '<span class="bar-val">' + fmt(count) + "</span></div>";
  }

  function renderStats() {
    var total = entries.length;
    var cats = CATEGORIES;
    var hero = [
      { n: total, l: "词条总数 ENTRIES" },
      { n: uniqueJa, l: "日本語术语 TERMS" },
      { n: cats.length, l: "领域标签 DOMAINS" },
      { n: counts.added, l: "自定义词条 CUSTOM" },
      { n: (META.patterns || []).length, l: "商务句型 PATTERNS" }
    ];
    var heroHtml = hero.map(function (h) {
      return '<div class="stat-card"><div class="stat-num">' + fmt(h.n) + '</div><div class="stat-label">' + h.l + "</div></div>";
    }).join("");

    var maxCat = cats.length ? cats[0].count : 1;
    var catHtml = cats.slice(0, 16).map(function (c) { return barRow(c.name, c.count, maxCat); }).join("");

    var kanaCounts = {};
    entries.forEach(function (e) { kanaCounts[e.kana] = (kanaCounts[e.kana] || 0) + 1; });
    var maxKana = KANA_ROWS.reduce(function (m, k) { return Math.max(m, kanaCounts[k] || 0); }, 1);
    var kanaHtml = KANA_ROWS.map(function (k) {
      var n = kanaCounts[k] || 0;
      var h = Math.max(2, Math.round((n / maxKana) * 56));
      return '<div class="letter-col" title="' + esc(k) + "行 · " + fmt(n) + ' 词条"><span class="bar" style="height:' +
        h + 'px"></span><span>' + esc(k) + "</span></div>";
    }).join("");

    var fieldCount = { note: 0, etym: 0, variant: 0, abbr: 0, syn: 0 };
    entries.forEach(function (e) {
      if (e.note) fieldCount.note++;
      if (e.etym) fieldCount.etym++;
      if (e.variant) fieldCount.variant++;
      if (e.abbr) fieldCount.abbr++;
      if (e.syn) fieldCount.syn++;
    });
    var fields = [
      ["注释", fieldCount.note],
      ["词源", fieldCount.etym],
      ["变形", fieldCount.variant],
      ["全称/简称", fieldCount.abbr],
      ["近义词", fieldCount.syn]
    ];
    var fieldHtml = fields.map(function (f) {
      var pct = total ? (f[1] / total) * 100 : 0;
      return '<div class="field-item"><span class="name">' + f[0] + '</span><span class="bar-track"><span class="bar-fill" style="width:' +
        pct.toFixed(1) + '%"></span></span><span class="val">' + fmt(f[1]) + " · " + pct.toFixed(1) + "%</span></div>";
    }).join("");

    el.statsScroll.innerHTML =
      '<div class="stats-hero">' + heroHtml + "</div>" +
      '<section class="stats-section"><h2>领域分布 <span class="muted" style="font-size:12px;letter-spacing:.06em">TOP 16 / ' + cats.length + "</span></h2>" +
        '<div class="bars">' + catHtml + "</div></section>" +
      '<section class="stats-section"><h2>五十音行分布 <span class="muted" style="font-size:12px;letter-spacing:.06em">読みの頭文字</span></h2><div class="letter-hist">' + kanaHtml + "</div></section>" +
      '<section class="stats-section"><h2>字段完整率</h2><div class="field-list">' + fieldHtml + "</div></section>" +
      '<section class="stats-section"><h2>关于这个 Beta</h2><div class="about">' +
        "<h3>日汉术语词典 · Beta " + esc(BUILD.version || "") + "</h3>" +
        "<p>共 " +
        fmt((META.total || 0)) + " 条基础日文词条（附中文释义与英文对照）、" + fmt((META.patterns || []).length) + " 条商务句型；当前显示 " +
        fmt(total) + " 条（含自定义与修改）。</p>" +
        "<p>当前版本为 Beta，以日语为主、中文释义，英文作为对照与词源参考：</p>" +
        "<ul>" +
          "<li>默认按日语读音（五十音）排序并检索；支持日本語、かな（假名）与中文检索，也可用英文检索作为补充。</li>" +
          "<li>多关键词用空格分隔（AND 关系）；片假名与平假名互通。</li>" +
          "<li>词条可新增、修改、删除，并可导入 / 导出词库；改动会写入云端词库，所有登录用户共享。</li>" +
          "<li>账户需登录后使用：一般用户可使用全部词库功能，并可修改自己的密码；管理员额外可新增 / 删除一般用户。</li>" +
          "<li>收藏与最近查看会随账号保存在云端（最近查看仍在本地浏览器）。</li>" +
          "<li>已知限制：无音频发音、无例句、无日文罗马字输入；分类标签为原表人工标注，个别词条存在多义。</li>" +
        "</ul>" +
        "<p class=\"muted\" style=\"font-size:12px\">更新日期：" + esc(BUILD.ts || "—") + " · 在线版（GitHub Pages + Supabase）。</p>" +
      "</div></section>";
  }

  /* ---------------- views ---------------- */
  var LIST_VIEWS = { all: 1, fav: 1 };

  function renderData() {
    var c = DATA.counts();
    if (el.resetDataBtn) el.resetDataBtn.hidden = !DATA.canReset;
    el.dataCards.innerHTML =
      '<div class="manage-card"><b>' + fmt(c.total) + '</b><span>当前词条</span></div>' +
      '<div class="manage-card"><b>' + fmt(c.added) + '</b><span>自定义新增</span></div>' +
      '<div class="manage-card"><b>' + fmt(c.edited) + '</b><span>已修改</span></div>' +
      '<div class="manage-card"><b>' + fmt(c.deleted) + '</b><span>已删除</span></div>' +
      '<div class="manage-card"><b>' + fmt(c.base) + '</b><span>基础词条</span></div>';
    var custom = entries.filter(function (e) { return e.custom; });
    if (el.customCount) el.customCount.textContent = "（" + fmt(custom.length) + " 条）";
    if (!custom.length) {
      el.customList.innerHTML = '<p class="table-empty">暂无自定义词条。点击列表上方的「＋ 新增」，或在词条详情中编辑现有词条。</p>';
      return;
    }
    var rows = custom.map(function (e) {
      return '<tr><td>' + e.id + '</td><td class="ja">' + esc(e.ja) + '</td><td>' + esc(e.reading) +
        '</td><td>' + esc(e.zh) + '</td><td><div class="table-actions">' +
        '<button class="btn ghost small" type="button" data-manage-edit="' + e.id + '">编辑</button>' +
        '<button class="btn ghost small" type="button" data-manage-delete="' + e.id + '">删除</button>' +
        '</div></td></tr>';
    }).join("");
    el.customList.innerHTML =
      '<table class="custom-table"><thead><tr><th>ID</th><th>日本語</th><th>読み方</th><th>中文</th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table>";
  }

  async function renderUsers() {
    var list = [];
    try {
      list = await AUTH.users();
    } catch (e) {
      console.error("renderUsers", e);
      el.userList.innerHTML = '<p class="table-empty">读取用户列表失败：' +
        esc(e && e.message ? e.message : "网络错误") + "</p>";
      return;
    }
    list = list || [];
    var rows = list.map(function (u) {
      var isAdmin = u.role === "admin";
      var actions = isAdmin
        ? '<span class="muted" style="font-size:12px">管理员账户，不可删除</span>'
        : '<div class="table-actions"><button class="btn ghost small" type="button" data-remove-user="' +
          esc(u.u) + '">删除</button></div>';
      return '<tr><td><strong>' + esc(u.u) + '</strong></td><td><span class="role-pill' + (isAdmin ? " is-admin" : "") + '">' +
        (isAdmin ? "管理员" : "一般用户") + "</span></td><td>" +
        (u.created ? new Date(u.created).toLocaleDateString("zh-CN") : "—") + "</td><td>" + actions + "</td></tr>";
    }).join("");
    el.userList.innerHTML =
      '<table class="user-table"><thead><tr><th>用户名</th><th>角色</th><th>创建日期</th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table>";
  }

  function setView(view, opts) {
    opts = opts || {};
    if (view === "users" && !AUTH.isAdmin()) {
      view = "all";
      toast("仅管理员可访问用户管理");
    }
    state.view = view;
    state.cursor = 0;
    var isList = !!LIST_VIEWS[view];
    el.viewList.hidden = !isList;
    el.viewPatterns.hidden = view !== "patterns";
    el.viewStats.hidden = view !== "stats";
    el.viewData.hidden = view !== "data";
    el.viewUsers.hidden = view !== "users";
    $$("#nav .nav-item, #navManage .nav-item, #navDrawer .nav-item").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-view") === view);
    });
    var filters = $("#filters");
    if (filters) filters.style.display = isList ? "" : "none";
    el.search.placeholder = view === "patterns" ? "搜索句型（日文 / 中文）"
      : view === "stats" ? "输入关键词回到词条检索"
        : view === "data" ? "输入关键词回到词条检索"
          : view === "users" ? "输入关键词回到词条检索"
            : "搜索 日本語 / かな / 中文 / 英文";
    if (isList) {
      refresh(!opts.keepScroll);
    } else if (view === "patterns") {
      filterPatterns();
    } else if (view === "stats") {
      renderStats();
    } else if (view === "data") {
      renderData();
    } else if (view === "users") {
      renderUsers();
    }
    closeDrawer();
  }

  /* ---------------- drawer ---------------- */
  function openDrawer() {
    el.drawer.classList.add("is-open");
    if (el.railMask) { el.railMask.hidden = false; requestAnimationFrame(function () { el.railMask.classList.add("is-show"); }); }
    el.railToggle.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    el.drawer.classList.remove("is-open");
    if (el.railMask) {
      el.railMask.classList.remove("is-show");
      setTimeout(function () { el.railMask.hidden = true; }, 200);
    }
    el.railToggle.setAttribute("aria-expanded", "false");
  }

  /* ---------------- query ---------------- */
  function setQuery(q) {
    state.query = q;
    if (el.search.value !== q) el.search.value = q;
    el.searchClear.hidden = !q;
    if (state.view === "stats" || state.view === "data" || state.view === "users") {
      state.view = "all";
      setView("all");
    }
    if (state.view === "patterns") {
      filterPatterns();
      return;
    }
    refresh(true);
  }

  /* ---------------- theme ---------------- */
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    storage.set(STORE.theme, next);
    return next;
  }

  /* ---------------- events ---------------- */
  var onSearch = debounce(function () { setQuery(el.search.value); }, 70);
  el.search.addEventListener("input", function () {
    el.searchClear.hidden = !el.search.value;
    onSearch();
  });
  el.search.addEventListener("keydown", function (ev) {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === "Escape") {
      ev.stopPropagation();
      if (el.search.value) { setQuery(""); }
      else el.search.blur();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      moveCursor(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      moveCursor(-1);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (items.length) { var idx = state.cursor >= 0 ? state.cursor : 0; openWord(items[idx].id); }
    }
  });
  el.searchClear.addEventListener("click", function () { setQuery(""); el.search.focus(); });
  el.theme.addEventListener("click", function () { toggleTheme(); toast(document.documentElement.getAttribute("data-theme") === "dark" ? "已切换深色" : "已切换浅色"); });
  el.randomBtn.addEventListener("click", randomWord);
  el.sortSelect.addEventListener("change", function () { state.sort = el.sortSelect.value; refresh(true); });

  el.nav.addEventListener("click", navClick);
  if (el.navManage) el.navManage.addEventListener("click", navClick);
  el.navDrawer.addEventListener("click", navClick);
  function navClick(ev) {
    var btn = ev.target.closest("[data-view]");
    if (btn) setView(btn.getAttribute("data-view"));
  }

  [el.catChips, el.catChipsDrawer].forEach(function (c) {
    c.addEventListener("click", function (ev) {
      var expand = ev.target.closest("[data-cat-expand]");
      if (expand) { state.expandedCats = !state.expandedCats; renderAllChips(); return; }
      var chip = ev.target.closest("[data-cat]");
      if (chip) toggleCat(chip.getAttribute("data-cat"));
    });
  });
  [el.catExpand, el.catExpandDrawer].forEach(function (b) {
    if (!b) return;
    b.addEventListener("click", function () { state.expandedCats = !state.expandedCats; renderAllChips(); });
  });
  [el.filterReset, el.filterResetDrawer].forEach(function (b) {
    if (b) b.addEventListener("click", clearFilters);
  });

  el.list.addEventListener("scroll", function () { schedulePaint(); }, { passive: true });
  el.list.addEventListener("click", function (ev) {
    var star = ev.target.closest("[data-star]");
    if (star) {
      ev.stopPropagation();
      toggleFav(Number(star.getAttribute("data-star")));
      return;
    }
    var row = ev.target.closest(".row");
    if (row) openWord(Number(row.getAttribute("data-id")));
  });
  el.letterBar.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-group]");
    if (!b || b.classList.contains("is-empty")) return;
    var g = b.getAttribute("data-group");
    var useEn = state.sort === "en";
    var idx = items.findIndex(function (e) { return (useEn ? e.letter : e.kana) === g; });
    if (idx >= 0) {
      el.list.scrollTop = idx * ROW_H;
      schedulePaint();
      if (items[idx]) { state.cursor = idx; openWord(items[idx].id); }
    }
  });

  el.detailBody.addEventListener("click", function (ev) {
    var copyBtn = ev.target.closest("[data-copy]");
    if (copyBtn) {
      var e = byId.get(Number(copyBtn.getAttribute("data-copy")));
      if (e) copyText(entryToText(e)).then(function (ok) { toast(ok ? "已复制词条" : "复制失败，请手动选择文本"); });
      return;
    }
    var favBtn = ev.target.closest("[data-fav]");
    if (favBtn) {
      toggleFav(Number(favBtn.getAttribute("data-fav")));
      return;
    }
    var editBtn = ev.target.closest("[data-edit]");
    if (editBtn) {
      openEntryForm(Number(editBtn.getAttribute("data-edit")));
      return;
    }
    var delBtn = ev.target.closest("[data-delete]");
    if (delBtn) {
      deleteEntry(Number(delBtn.getAttribute("data-delete")));
      return;
    }
    var open = ev.target.closest("[data-open]");
    if (open) openWord(Number(open.getAttribute("data-open")));
  });
  el.detailClose.addEventListener("click", function () { el.detail.classList.remove("is-open"); });
  el.detailEmpty.addEventListener("click", function (ev) {
    var recent = ev.target.closest("[data-recent]");
    if (recent) openWord(Number(recent.getAttribute("data-recent")));
  });

  el.patternList.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-copy-pattern]");
    if (!btn) return;
    var p = (META.patterns || []).find(function (x) { return String(x.id) === btn.getAttribute("data-copy-pattern"); });
    if (p) copyText(p.ja + "\n" + p.zh).then(function (ok) { toast(ok ? "已复制句型" : "复制失败"); });
  });

  /* ---- auth forms ----
     In Supabase mode the login form is owned by src/main.js (it must fetch the
     dictionary before importing this UI module), so we only wire the logout. */
  el.logoutBtn.addEventListener("click", doLogout);
  el.changePassBtn.addEventListener("click", openPasswordModal);
  $$("[data-close-password]").forEach(function (b) {
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      closePasswordModal();
    });
  });
  el.passwordForm.addEventListener("submit", savePasswordForm);

  /* ---- entry editor ---- */
  el.addEntryBtn.addEventListener("click", function () { openEntryForm(null); });
  el.entryForm.addEventListener("submit", saveEntryForm);
  $$("[data-close-modal]").forEach(function (b) {
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      closeEntryForm();
    });
  });

  /* ---- library management ---- */
  el.exportCsvBtn.addEventListener("click", function () {
    if (downloadFile("日汉术语词典_词库_" + stamp() + ".csv", DATA.exportCSV(), "text/csv;charset=utf-8")) toast("已导出 CSV");
  });
  el.exportJsonBtn.addEventListener("click", function () {
    if (downloadFile("日汉术语词典_备份_" + stamp() + ".json", DATA.exportJSON(), "application/json;charset=utf-8")) toast("已导出 JSON 备份");
  });
  el.importBtn.addEventListener("click", function () { el.importFile.click(); });
  el.importFile.addEventListener("change", function () {
    if (this.files && this.files[0]) handleImportFile(this.files[0]);
    this.value = "";
  });
  el.resetDataBtn.addEventListener("click", async function () {
    if (!DATA.canReset) {
      toast("云端词库请通过备份恢复（本版暂未开放一键重置）");
      return;
    }
    if (!window.confirm("确定恢复初始词库吗？\n将清除所有自定义词条、修改与删除记录（不影响账户）。")) return;
    try { await DATA.reset(); } catch (e) { toast("恢复失败：" + (e && e.message ? e.message : "网络错误")); return; }
    state.favOrder = state.favOrder.filter(function (id) { return BASE_ROWS.some(function (r) { return r.id === id; }); });
    state.favs = new Set(state.favOrder);
    showDetailEmpty();
    rebuildAfterChange();
    toast("已恢复初始词库");
  });
  el.customList.addEventListener("click", function (ev) {
    var edit = ev.target.closest("[data-manage-edit]");
    if (edit) { openEntryForm(Number(edit.getAttribute("data-manage-edit"))); return; }
    var del = ev.target.closest("[data-manage-delete]");
    if (del) deleteEntry(Number(del.getAttribute("data-manage-delete")));
  });

  /* ---- user management (admin) ---- */
  el.addUserForm.addEventListener("submit", handleAddUser);
  el.userList.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-remove-user]");
    if (btn) handleRemoveUser(btn.getAttribute("data-remove-user"));
  });

  el.railToggle.addEventListener("click", function () {
    if (el.drawer.classList.contains("is-open")) closeDrawer(); else openDrawer();
  });
  if (el.railMask) el.railMask.addEventListener("click", closeDrawer);

  window.addEventListener("resize", debounce(function () {
    if (el.viewList.hidden) return;
    lastPaint.version = -1;
    paintList(true);
  }, 120));

  document.addEventListener("keydown", function (ev) {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (!state.started) return;
    var target = ev.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" || target.isContentEditable);
    if (ev.key === "Escape") {
      if (!el.passwordModal.hidden) { closePasswordModal(); return; }
      if (!el.entryModal.hidden) { closeEntryForm(); return; }
      if (el.detail.classList.contains("is-open")) { el.detail.classList.remove("is-open"); return; }
      if (el.drawer.classList.contains("is-open")) { closeDrawer(); return; }
      if (typing && target === el.search) return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "k" || ev.key === "K")) {
      ev.preventDefault();
      el.search.focus();
      el.search.select();
      return;
    }
    if (typing) return;
    if (state.view !== "all" && state.view !== "fav") {
      if (["ArrowDown", "ArrowUp", "Enter", "f", "F", "c", "C"].indexOf(ev.key) !== -1) return;
    }
    if (ev.key === "/") {
      ev.preventDefault();
      el.search.focus();
      el.search.select();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      moveCursor(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      moveCursor(-1);
    } else if (ev.key === "Enter") {
      if (state.selectedId) el.detail.classList.add("is-open");
    } else if ((ev.key === "f" || ev.key === "F") && state.selectedId) {
      toggleFav(state.selectedId);
    } else if ((ev.key === "c" || ev.key === "C") && state.selectedId) {
      var e = byId.get(state.selectedId);
      if (e) copyText(entryToText(e)).then(function (ok) { toast(ok ? "已复制词条" : "复制失败"); });
    } else if (ev.key === "r" || ev.key === "R") {
      randomWord();
    }
  });

  function moveCursor(delta) {
    if (!items.length) return;
    var base = state.selectedId
      ? items.findIndex(function (e) { return e.id === state.selectedId; })
      : -1;
    var next = base < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, base + delta));
    var e = items[next];
    if (!e) return;
    state.cursor = next;
    openWord(e.id);
  }

  function randomWord() {
    if (state.view !== "all" && state.view !== "fav") setView("all");
    var pool = items.length ? items : entries;
    var e = pool[Math.floor(Math.random() * pool.length)];
    if (!e) return;
    var idx = items.findIndex(function (x) { return x.id === e.id; });
    if (idx >= 0) { state.cursor = idx; scrollToIndex(idx); }
    openWord(e.id, { scroll: false, force: true });
    if (idx >= 0) scrollToIndex(idx);
  }

  /* ---------------- CRUD / import / export ---------------- */
  function downloadFile(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (e) { }
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 100);
      return true;
    } catch (e) {
      toast("导出失败：" + (e && e.message ? e.message : "浏览器限制"));
      return false;
    }
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "_" + pad2(d.getHours()) + pad2(d.getMinutes());
  }

  function rebuildAfterChange(opts) {
    opts = opts || {};
    buildData();
    state.favOrder = state.favOrder.filter(function (id) { return byId.has(id); });
    state.favs = new Set(state.favOrder);
    state.recent = state.recent.filter(function (id) { return byId.has(id); });
    if (state.selectedId && !byId.has(state.selectedId)) {
      state.selectedId = null;
      showDetailEmpty();
    }
    updateChromeCounts();
    if (state.view === "data") renderData();
    else if (state.view === "users") renderUsers();
    else if (state.view === "stats") renderStats();
    else if (state.view === "patterns") filterPatterns();
    else refresh(true);
    if (opts.openId && byId.has(opts.openId)) {
      if (state.view !== "all" && state.view !== "fav") setView("all");
      openWord(opts.openId, { force: true });
    } else if (state.selectedId) {
      renderDetail(byId.get(state.selectedId));
    }
  }

  function openEntryForm(id) {
    var e = id ? byId.get(Number(id)) : null;
    state.editingId = e ? e.id : null;
    el.entryModalTitle.textContent = e ? "编辑词条" : "新增词条";
    el.entryFormHint.textContent = e
      ? (e.custom ? "自定义词条 #" + e.id : "基础词条 #" + e.id + "（保存后写入数据库）")
      : "保存后立即写入 Supabase 词库";
    var f = el.entryForm;
    ["ja", "reading", "zh", "en", "cats", "variant", "abbr", "syn", "etym", "note"].forEach(function (name) {
      f.elements[name].value = e ? (name === "cats" ? e.cats.join(";") : (e[name] || "")) : "";
    });
    el.entryModal.hidden = false;
    setTimeout(function () { f.elements.ja.focus(); }, 30);
  }

  function closeEntryForm() {
    el.entryModal.hidden = true;
    state.editingId = null;
  }

  function openPasswordModal() {
    el.passwordForm.reset();
    el.passwordMsg.textContent = "";
    el.passwordMsg.className = "form-msg";
    el.passwordModal.hidden = false;
    setTimeout(function () { el.passwordForm.elements.password.focus(); }, 30);
  }

  function closePasswordModal() {
    el.passwordModal.hidden = true;
  }

  async function savePasswordForm(ev) {
    ev.preventDefault();
    var f = el.passwordForm;
    var pass = String(f.elements.password.value || "");
    var confirm = String(f.elements.confirm.value || "");
    el.passwordMsg.textContent = "";
    el.passwordMsg.className = "form-msg";
    if (pass.length < 6) {
      el.passwordMsg.textContent = "新密码至少 6 位";
      return;
    }
    if (pass !== confirm) {
      el.passwordMsg.textContent = "两次输入的密码不一致";
      return;
    }
    var r;
    try {
      r = await AUTH.changePassword(pass);
    } catch (e) {
      r = { ok: false, error: e && e.message ? e.message : "网络错误" };
    }
    if (!r.ok) {
      el.passwordMsg.textContent = r.error || "修改失败";
      return;
    }
    closePasswordModal();
    toast("密码已修改，下次登录请使用新密码");
  }

  async function saveEntryForm(ev) {
    ev.preventDefault();
    var f = el.entryForm;
    var src = {};
    ["ja", "reading", "zh", "en", "cats", "variant", "abbr", "syn", "etym", "note"].forEach(function (name) {
      src[name] = String(f.elements[name].value || "").trim();
    });
    if (!src.ja) {
      toast("「日本語」不能为空");
      f.elements.ja.focus();
      return;
    }
    src.cats = src.cats.split(/[;；、,，\s]+/).filter(Boolean).join(";");
    var id = state.editingId;
    var wasEdit = !!id;
    try {
      if (id && byId.has(id)) await DATA.update(id, src);
      else id = await DATA.add(src);
    } catch (e) {
      toast("保存失败：" + (e && e.message ? e.message : "网络错误"));
      return;
    }
    closeEntryForm();
    rebuildAfterChange({ openId: id });
    toast(wasEdit ? "已保存修改" : "已新增词条");
  }

  async function deleteEntry(id) {
    var e = byId.get(Number(id));
    if (!e) return;
    if (!window.confirm("确定删除词条「" + e.ja + "」吗？\n删除后管理员可通过备份恢复。")) return;
    try {
      await DATA.remove(e.id);
    } catch (err) {
      toast("删除失败：" + (err && err.message ? err.message : "网络错误"));
      return;
    }
    var wasFav = state.favs.has(e.id);
    state.favOrder = state.favOrder.filter(function (x) { return x !== e.id; });
    state.favs = new Set(state.favOrder);
    if (wasFav && DATA.setFavorite) {
      Promise.resolve(DATA.setFavorite(e.id, false)).catch(function () { /* best effort */ });
    }
    showDetailEmpty();
    rebuildAfterChange();
    toast("已删除词条");
  }

  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function () {
      var text = String(reader.result || "");
      var isJSON = /^\s*[\[{]/.test(text);
      var result;
      try {
        result = isJSON ? await DATA.importJSON(text) : await DATA.importCSV(text);
      } catch (err) {
        toast("导入失败：" + (err && err.message ? err.message : "网络错误"));
        return;
      }
      if (!result.ok) { toast(result.error || "导入失败"); return; }
      rebuildAfterChange();
      var msg = "导入完成：新增 " + result.added + " 条";
      if (result.updated) msg += "，更新 " + result.updated + " 条";
      if (result.skipped) msg += "，跳过 " + result.skipped + " 条";
      toast(msg);
    };
    reader.onerror = function () { toast("读取文件失败"); };
    reader.readAsText(file, "utf-8");
  }

  function updateChromeCounts() {
    el.navAllCount.textContent = fmt(entries.length);
    el.navFavCount.textContent = fmt(state.favs.size);
    el.navPatternCount.textContent = fmt((META.patterns || []).length);
    if (el.footTotal) el.footTotal.textContent = fmt(entries.length);
    if (el.footCats) el.footCats.textContent = fmt(CATEGORIES.length);
    renderAllChips();
  }

  /* ---------------- accounts UI ---------------- */
  function setUserChrome() {
    var u = AUTH.current();
    if (!u) return;
    el.userName.textContent = u.u;
    el.userAvatar.textContent = (u.u.charAt(0) || "U").toUpperCase();
    var admin = u.role === "admin";
    el.userRole.textContent = admin ? "管理员" : "一般";
    el.userRole.className = "role-badge" + (admin ? " is-admin" : "");
    [el.navUsers, el.navUsersDrawer].forEach(function (b) { if (b) b.hidden = !admin; });
  }

  async function handleAddUser(ev) {
    ev.preventDefault();
    el.addUserMsg.textContent = "";
    el.addUserMsg.className = "form-msg";
    var name = el.newUserName.value.trim();
    var pass = el.newUserPass.value;
    var r;
    try {
      r = await AUTH.addUser(name, pass);
    } catch (e) {
      r = { ok: false, error: e && e.message ? e.message : "网络错误" };
    }
    if (!r.ok) {
      el.addUserMsg.textContent = r.error;
      return;
    }
    el.newUserName.value = "";
    el.newUserPass.value = "";
    el.addUserMsg.textContent = "已新增用户 " + name;
    el.addUserMsg.className = "form-msg is-ok";
    await renderUsers();
    toast("已新增一般用户");
  }

  async function handleRemoveUser(name) {
    var list = [];
    try { list = await AUTH.users(); } catch (e) { list = []; }
    var u = (list || []).filter(function (x) { return x.u === name; })[0];
    if (!u) return;
    if (!window.confirm("确定删除一般用户「" + name + "」吗？该用户将无法再登录。")) return;
    var r;
    try {
      r = await AUTH.removeUser(name);
    } catch (e) {
      r = { ok: false, error: e && e.message ? e.message : "网络错误" };
    }
    if (!r.ok) { toast(r.error); return; }
    await renderUsers();
    toast("已删除用户 " + name);
  }

  function doLogout() {
    Promise.resolve(AUTH.logout()).finally(function () {
      try { location.reload(); }
      catch (e) {
        el.authGate.hidden = false;
        el.appHeader.hidden = true;
        el.appRoot.hidden = true;
      }
    });
  }

  /* ---------------- init chrome ---------------- */
  function initChrome() {
    updateChromeCounts();
    if (el.footBuild) el.footBuild.textContent = (BUILD.ts || "").slice(0, 16) || "—";
    el.sortSelect.value = state.sort;
    renderRecent();
    setView("all");
  }

  /* ---------------- self test ---------------- */
  function runSelfTest() {
    var results = [];
    function t(name, fn) {
      try {
        var detail = fn();
        results.push({ name: name, ok: true, detail: detail == null ? "" : String(detail) });
      } catch (err) {
        results.push({ name: name, ok: false, detail: (err && err.message) || String(err) });
      }
    }
    function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
    function searchIds(q) {
      state.query = q;
      state.view = "all";
      state.cats.clear();
      return computeItems().map(function (e) { return e.id; });
    }
    var allIds;
    t("data.total", function () {
      assert(BASE_ROWS.length === 9058, "base rows " + BASE_ROWS.length);
      assert(entries.length === counts.total, "merged " + entries.length + " vs " + counts.total);
      return entries.length;
    });
    t("data.uniqueJa", function () { assert(uniqueJa === new Set(entries.map(function (e) { return e.ja.toLowerCase(); })).size, "uniqueJa mismatch"); return uniqueJa; });
    t("data.overlay", function () {
      var c = DATA.counts();
      assert(c.total === BASE_ROWS.length - c.deleted + c.added, "overlay arithmetic");
      assert(counts.added === c.added && counts.edited === c.edited && counts.deleted === c.deleted, "overlay counts mismatch");
      return c.added + " added / " + c.edited + " edited / " + c.deleted + " deleted";
    });
    t("auth.sha256", function () {
      if (window.__SUPABASE_MODE__) return "skipped (supabase auth)";
      assert(AUTH.sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256 vector failed");
      assert(AUTH.sha256("日本語") === AUTH.sha256("日本語"), "hash not deterministic");
      return "ok";
    });
    t("auth.defaults", function () {
      if (window.__SUPABASE_MODE__) return "skipped (supabase auth)";
      var users = AUTH.users();
      var taize = users.filter(function (u) { return u.u === "taize"; })[0];
      var admin = users.filter(function (u) { return u.u === "admin"; })[0];
      assert(taize && taize.role === "user", "taize missing");
      assert(admin && admin.role === "admin", "admin missing");
      var cur = AUTH.current();
      assert(cur && cur.u, "no session");
      return cur.u + ":" + cur.role;
    });
    t("auth.permissions", function () {
      if (window.__SUPABASE_MODE__) return "skipped (remote users)";
      var user = "selftest_tmp_user";
      var existing = AUTH.users().some(function (u) { return u.u === user; });
      if (AUTH.isAdmin()) {
        if (existing) AUTH.removeUser(user);
        var r = AUTH.addUser(user, "pass1234");
        assert(r.ok, r.error || "admin add failed");
        var r2 = AUTH.removeUser(user);
        assert(r2.ok, r2.error || "admin remove failed");
        return "admin add/remove ok";
      }
      var r3 = AUTH.addUser(user, "pass1234");
      assert(!r3.ok, "general user must not manage accounts");
      return "general user denied";
    });
    t("search.english", function () { allIds = searchIds("architecture"); assert(allIds.length > 0, "no hit"); var first = byId.get(allIds[0]); assert(norm(first.en).indexOf("architecture") !== -1, "first=" + first.en); return allIds.length; });
    t("search.katakana", function () { var ids = searchIds("アーキテクチャ"); assert(ids.length > 0, "no hit"); var first = byId.get(ids[0]); assert(first.ja.indexOf("アーキテクチャ") !== -1, "first.ja=" + first.ja); return ids.length; });
    t("search.hiragana", function () { var ids = searchIds("あーきてくちゃ"); assert(ids.length > 0, "no hit"); return ids.length; });
    t("search.chinese", function () { var ids = searchIds("架构"); assert(ids.length > 0, "no hit"); var first = byId.get(ids[0]); assert(first.zh.indexOf("架构") !== -1, "first.zh=" + first.zh); return ids.length; });
    t("search.hyphen", function () { var ids = searchIds("type c"); assert(ids.length > 0, "no hit"); return ids.length; });
    t("filter.category", function () {
      state.query = ""; state.view = "all";
      state.cats.clear(); state.cats.add("管理");
      var n = computeItems().length;
      var expected = CATEGORIES.filter(function (c) { return c.name === "管理"; })[0].count;
      assert(n === expected, n + " vs " + expected);
      state.cats.clear();
      return n;
    });
    t("sort.kana", function () {
      state.query = ""; state.cats.clear(); state.view = "all"; state.sort = "kana";
      var list = computeItems();
      var ok = true;
      for (var i = 1; i < Math.min(list.length, 300); i++) {
        if (collatorJa.compare(list[i - 1].rdKey, list[i].rdKey) > 0) { ok = false; break; }
      }
      assert(ok, "not sorted by kana");
      return list.length;
    });
    t("store.roundtrip", function () {
      if (window.__SUPABASE_MODE__) return "skipped (remote db)";
      var before = entries.length;
      var id = DATA.add({ ja: "__selftest_temp__", reading: "せるふてすと", zh: "临时词条", cats: "测试" });
      buildData();
      assert(byId.has(id), "added entry missing");
      assert(byId.get(id).ja === "__selftest_temp__", "ja mismatch");
      DATA.update(id, { zh: "临时词条2" });
      buildData();
      assert(byId.get(id).zh === "临时词条2", "update failed");
      DATA.remove(id);
      buildData();
      assert(!byId.has(id), "remove failed");
      assert(entries.length === before, "count not restored " + entries.length + " vs " + before);
      return "ok";
    });
    t("render.rows", function () {
      state.view = "all"; refresh(true);
      var n = el.listInner.querySelectorAll(".row").length;
      assert(n > 0, "no rows rendered");
      return n;
    });
    t("render.detail", function () {
      openWord(entries[0].id);
      var txt = el.detailBody.textContent;
      assert(txt.indexOf(entries[0].ja) !== -1, "ja missing");
      assert(txt.indexOf(entries[0].en) !== -1, "en missing");
      assert(txt.indexOf("分享人") === -1, "owner field leaked into detail");
      assert(txt.indexOf("高频") === -1, "high-frequency marker leaked into detail");
      assert(el.detailBody.hidden === false, "detail hidden");
      return entries[0].ja;
    });
    t("favorites.toggle", function () {
      if (window.__SUPABASE_MODE__) return "skipped (remote favorites)";
      var id = entries[0].id;
      var before = state.favs.size;
      toggleFav(id, true);
      assert(state.favs.has(id), "not added");
      toggleFav(id, true);
      assert(state.favs.size === before, "not removed");
      return "ok";
    });
    t("patterns.count", function () {
      setView("patterns");
      var n = el.patternList.querySelectorAll(".pattern-card").length;
      assert(n === (META.patterns || []).length, n + " cards, q=" + JSON.stringify(state.query) + ", filtered=" + JSON.stringify(queryTokens()));
      return n;
    });
    t("patterns.reset", function () {
      setView("patterns");
      setQuery("発注");
      var n1 = el.patternList.querySelectorAll(".pattern-card").length;
      setQuery("");
      var n2 = el.patternList.querySelectorAll(".pattern-card").length;
      assert(n1 > 0 && n1 < (META.patterns || []).length, "filtered " + n1);
      assert(n2 === (META.patterns || []).length, "reset " + n2);
      assert(el.patternEmpty.hidden, "empty state still shown after reset");
      return n1 + "->" + n2;
    });
    t("index.kana", function () {
      setView("all");
      var n = el.letterBar.querySelectorAll(".letter").length;
      assert(n === KANA_ROWS.length, n + " kana rows");
      return n;
    });
    t("theme.toggle", function () {
      var before = document.documentElement.getAttribute("data-theme");
      var after = toggleTheme();
      assert(after !== before, "theme unchanged");
      toggleTheme();
      return after;
    });
    // reset state
    state.query = ""; el.search.value = ""; el.searchClear.hidden = true;
    state.cats.clear();
    state.sort = "kana"; el.sortSelect.value = "kana";
    state.selectedId = null;
    setView("all");
    var pass = results.filter(function (r) { return r.ok; }).length;
    var failed = results.filter(function (r) { return !r.ok; });
    var summary = {
      version: BUILD.version,
      pass: pass,
      fail: failed.length,
      total: results.length,
      results: results
    };
    document.title = "SELFTEST " + (failed.length ? "FAIL" : "PASS") + " " + pass + "/" + results.length;
    el.selftestOut.hidden = false;
    el.selftestOut.textContent = JSON.stringify(summary, null, 2);
    if (window.console) console.log("SELFTEST", summary);
    return summary;
  }

  /* ---------------- boot / auth gate ---------------- */
  var PUBLIC = {
    version: BUILD.version,
    meta: META,
    get entries() { return entries; },
    state: state,
    search: function (q) {
      state.query = q; state.view = "all"; state.cats.clear();
      return computeItems();
    },
    items: function () { return items; },
    setQuery: setQuery,
    setView: setView,
    setCat: function (name) { state.cats.clear(); if (name) state.cats.add(name); refresh(true); },
    open: openWord,
    toggleFav: toggleFav,
    favs: function () { return Array.from(state.favs); },
    selfTest: runSelfTest,
    data: DATA,
    auth: AUTH,
    rebuild: rebuildAfterChange,
    openForm: openEntryForm,
    deleteEntry: deleteEntry
  };

  function applyDeepLinks() {
    var params = new URLSearchParams(window.location.search || "");
    try {
      var themeParam = params.get("theme");
      if (themeParam === "dark" || themeParam === "light") {
        document.documentElement.setAttribute("data-theme", themeParam);
      }
      var qParam = params.get("q");
      if (qParam) setQuery(qParam);
      var viewParam = params.get("view");
      if (["fav", "patterns", "stats", "data", "users", "all"].indexOf(viewParam) !== -1) {
        setView(viewParam);
      }
      var wParam = params.get("w");
      if (wParam && byId.has(Number(wParam))) {
        if (state.view !== "all" && state.view !== "fav") setView("all");
        openWord(Number(wParam));
      }
    } catch (e) { /* ignore malformed deep links */ }
    return params;
  }

  function startApp() {
    if (state.started) return;
    if (!AUTH.current()) { showAuthGate(); return; }
    state.started = true;
    el.authGate.hidden = true;
    el.appHeader.hidden = false;
    el.appRoot.hidden = false;
    setUserChrome();
    buildData();
    state.favOrder = state.favOrder.filter(function (id) { return byId.has(id); });
    state.favs = new Set(state.favOrder);
    state.recent = state.recent.filter(function (id) { return byId.has(id); });
    initChrome();
    var params = applyDeepLinks();
    window.__DICT__ = PUBLIC;
    window.__DICT_READY__ = true;
    if (window.console) console.info("[日汉术语词典] " + fmt(entries.length) + " 词条 · " + BUILD.version);
    if (params.get("selftest") === "1") {
      setTimeout(function () { runSelfTest(); }, 30);
    }
  }

  function showAuthGate() {
    el.authGate.hidden = false;
    el.appHeader.hidden = true;
    el.appRoot.hidden = true;
    setTimeout(function () {
      try { el.loginUser.focus(); } catch (e) { }
    }, 60);
  }

  window.__START_APP__ = startApp;
  if (AUTH.current()) startApp();
  else showAuthGate();
})();


