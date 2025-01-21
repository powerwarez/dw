import { createClient } from "@supabase/supabase-js";

const supabaseAuthUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAuthKey = import.meta.env.VITE_SUPABASE_KEY || "";
const supabaseAuth = createClient(supabaseAuthUrl, supabaseAuthKey);

export default supabaseAuth;
