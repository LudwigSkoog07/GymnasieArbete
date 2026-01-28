import { supabase } from "./supabaseClient.js";

export async function requireLogin() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = "Auth.html";
    throw new Error("Not logged in");
  }
  return data.session;
}