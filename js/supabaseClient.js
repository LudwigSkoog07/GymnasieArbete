import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://gkrhnjxualfildbogypo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TBAqVFDR7UntAa-u1C2rzA_mFafSTJy";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
