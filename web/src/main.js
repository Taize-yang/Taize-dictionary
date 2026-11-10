import "./styles.css";
import { supabase } from "./supabase.js";
import { authAdapter, setSessionUser } from "./auth-adapter.js";
import { StoreAdapter, fetchAllTerms, fetchPatterns } from "./store-adapter.js";

const FIELDS = ["en", "ja", "reading", "zh", "cats", "freq", "note", "etym", "variant", "abbr", "syn", "img", "owner"];
const BUILD_INFO = {
  version: "0.4.0-supabase",
  ts: new Date().toLocaleString("zh-CN"),
  source: "Supabase / terms + patterns",
};

const gate = document.getElementById("authGate");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginError = document.getElementById("loginError");
const lead = document.querySelector(".auth-lead");

let booting = false;

function setError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

function setLoading(message) {
  if (lead) lead.textContent = message;
}

async function loadPayload() {
  setLoading("正在加载词库…");
  const terms = await fetchAllTerms();
  const patterns = await fetchPatterns();
  const store = new StoreAdapter(terms);
  const rows = store.merged();
  const payload = {
    meta: {
      total: rows.length,
      patterns: patterns.map((p) => ({ id: p.id, ja: p.ja, zh: p.zh })),
      source: "词汇表-已补充.xlsx（Supabase）",
    },
    fields: FIELDS,
    rows,
  };
  return { payload, store, terms };
}

async function enterApp(authUser) {
  if (booting) return;
  booting = true;
  loginForm.querySelector("button[type=submit]").disabled = true;
  try {
    setSessionUser(authUser);
    const { payload, store } = await loadPayload();
    window.__SUPABASE_MODE__ = true;
    window.__DICT_PAYLOAD__ = payload;
    window.__BUILD__ = BUILD_INFO;
    window.__AUTH__ = authAdapter;
    window.__STORE__ = store;
    // app.js is only imported after the session + dictionary are ready; it boots
    // itself (startApp) and hides the login gate.
    await import("./app.js");
    if (gate) gate.hidden = true;
  } catch (error) {
    console.error(error);
    setError("词库加载失败：" + (error && error.message ? error.message : "网络或权限错误"));
    setLoading("词库需要登录后才能访问。");
    try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    booting = false;
    loginForm.querySelector("button[type=submit]").disabled = false;
  }
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    setLoading("词库需要登录后才能访问。");
    setSessionUser(null);
    return;
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    return;
  }
  await enterApp(user);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (booting) return;
  setError("");
  const username = loginUser.value.trim();
  const password = loginPass.value;
  if (!username || !password) {
    setError("请输入用户名和密码");
    return;
  }
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${username.toLowerCase()}@${import.meta.env.VITE_USER_EMAIL_DOMAIN || "dict.local"}`,
      password,
    });
    if (error || !data.user) {
      setError("用户名或密码错误");
      return;
    }
    loginPass.value = "";
    await enterApp(data.user);
  } catch (error) {
    setError("登录失败：" + (error && error.message ? error.message : "网络错误"));
  } finally {
    if (!booting) button.disabled = false;
  }
});

boot().catch((error) => {
  console.error(error);
  setError("初始化失败：" + (error && error.message ? error.message : "未知错误"));
});

