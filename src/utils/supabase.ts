import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_API_KEY as string;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,       // 세션 정보를 localStorage에 저장함
    autoRefreshToken: true,     // 토큰 자동 갱신 활성화
    detectSessionInUrl: true,   // OAuth 완료 후 URL에 포함된 세션 정보를 자동으로 캐치함
  }
});

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
