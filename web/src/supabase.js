import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。请在 web/.env.local 中配置。"
  );
}

export const SUPABASE_URL = url.replace(/\/$/, "");
export const SUPABASE_ANON_KEY = anonKey;
export const USER_EMAIL_DOMAIN = import.meta.env.VITE_USER_EMAIL_DOMAIN || "dict.local";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function usernameToEmail(username) {
  return `${String(username || "").trim().toLowerCase()}@${USER_EMAIL_DOMAIN}`;
}

export function emailToUsername(email) {
  const value = String(email || "");
  const at = value.indexOf("@");
  return at > 0 ? value.slice(0, at) : value;
}
