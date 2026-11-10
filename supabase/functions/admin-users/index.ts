// ============================================================
// admin-users — 管理员增删一般用户（service_role 只存在于本函数）
// Deploy: npx supabase functions deploy admin-users --no-verify-jwt
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_DOMAIN = Deno.env.get("USER_EMAIL_DOMAIN") ?? "dict.local";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing token" }, 401);

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: "invalid token" }, 401);
  if (user.app_metadata?.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: { action?: string; username?: string; password?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = body.action;

  if (action === "list") {
    const { data, error } = await admin
      .from("profiles")
      .select("username, role, created_at")
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, users: data });
  }

  if (action === "create") {
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(username)) return json({ error: "用户名需为 2–20 位字母、数字、下划线或连字符" }, 400);
    if (password.length < 6) return json({ error: "密码至少 6 位（Supabase 默认策略）" }, 400);

    const email = `${username}@${EMAIL_DOMAIN}`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "user" },
    });
    if (createError) return json({ error: createError.message }, 400);

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      username,
      role: "user",
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return json({ error: profileError.message }, 500);
    }
    return json({ ok: true, username });
  }

  if (action === "delete") {
    const username = String(body.username ?? "").trim();
    if (!username) return json({ error: "missing username" }, 400);
    const { data: profile, error: findError } = await admin
      .from("profiles").select("id, role").eq("username", username).maybeSingle();
    if (findError) return json({ error: findError.message }, 500);
    if (!profile) return json({ error: "用户不存在" }, 404);
    if (profile.role === "admin") return json({ error: "管理员账户不可删除" }, 400);

    const { error: deleteError } = await admin.auth.admin.deleteUser(profile.id);
    if (deleteError) return json({ error: deleteError.message }, 500);
    return json({ ok: true, username });
  }

  return json({ error: "unknown action" }, 400);
});

