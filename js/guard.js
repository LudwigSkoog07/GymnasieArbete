import { supabase } from "./supabaseClient.js";

export async function requireLogin() {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error("Error fetching session:", {
        code: error.code,
        message: error.message,
      });
      window.location.href = "Auth.html";
      throw new Error(`Session error: ${error.message}`);
    }
    
    if (!data?.session) {
      console.warn("No active session found");
      window.location.href = "Auth.html";
      throw new Error("Not logged in");
    }
    
    console.log("✅ Session valid, user:", data.session.user.id);
    return data.session;
  } catch (err) {
    console.error("requireLogin() caught error:", err.message);
    throw err;
  }
}