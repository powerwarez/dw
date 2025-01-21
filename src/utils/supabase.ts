import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;

export async function saveSettings(userId: string, settings: any) {
  const { data, error } = await supabase
    .from("settings")
    .upsert({ user_id: userId, ...settings }, { onConflict: "user_id" });

  if (error) {
    console.error("Error saving settings:", error);
    throw error;
  }

  return data;
}

export async function loadSettings(userId: string) {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Error loading settings:", error);
    throw error;
  }

  return data;
}
