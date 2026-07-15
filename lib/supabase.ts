import { createClient } from "@supabase/supabase-js";

// Publishable key — aman untuk client-side. Override lewat env kalau perlu.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ptkhwoabeclqbfemxgnj.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_dBd3RHqKg0AE7RnzRoe8aw_dRq6QDhg";

export const supabase = createClient(supabaseUrl, supabaseKey);
