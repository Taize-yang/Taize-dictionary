import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, usernameToEmail, emailToUsername } from "./supabase.js";

let cachedUser = null; // { u, role, id }

function toUser(authUser) {
  if (!authUser) return null;
  return {
    id: authUser.id,
    u: emailToUsername(authUser.email),
    role: authUser.app_metadata?.role || "user",
  };
}

export function setSessionUser(authUser) {
  cachedUser = toUser(authUser);
  return cachedUser;
}

export function getUser() {
  return cachedUser;
}

async function adminCall(payload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "登录已过期，请重新登录" };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await response.json(); } catch (e) { body = null; }
  if (!response.ok) {
    return { ok: false, error: (body && body.error) || `HTTP ${response.status}` };
  }
  return { ok: true, ...(body || {}) };
}

export const authAdapter = {
  current() {
    return cachedUser ? { u: cachedUser.u, role: cachedUser.role } : null;
  },
  isAdmin() {
    return !!cachedUser && cachedUser.role === "admin";
  },
  async login(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) return { ok: false, error: "用户名或密码错误" };
    cachedUser = toUser(data.user);
    return { ok: true, user: { u: cachedUser.u, role: cachedUser.role } };
  },
  async logout() {
    cachedUser = null;
    await supabase.auth.signOut();
  },
  async changePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: error.message || "修改密码失败" };
    return { ok: true };
  },
  async users() {
    const res = await adminCall({ action: "list" });
    if (!res.ok) throw new Error(res.error || "读取用户失败");
    return (res.users || []).map((u) => ({
      u: u.username,
      role: u.role,
      created: u.created_at ? Date.parse(u.created_at) : 0,
    }));
  },
  async addUser(username, password) {
    const res = await adminCall({ action: "create", username, password });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  },
  async removeUser(username) {
    const res = await adminCall({ action: "delete", username });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  },
};
