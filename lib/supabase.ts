import { createClient } from "@supabase/supabase-js";

// Publishable key — aman untuk client-side. Override lewat env kalau perlu.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ptkhwoabeclqbfemxgnj.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_dBd3RHqKg0AE7RnzRoe8aw_dRq6QDhg";

export const supabase = createClient(supabaseUrl, supabaseKey);

/** Bentuk minimal error PostgREST yang dipakai di sini. */
type QueryError = { code?: string; message?: string } | null | undefined;

/**
 * Error transien "JWT issued at future" (PostgREST **PGRST303**).
 *
 * Muncul kalau jam server PostgREST tertinggal dari jam server Auth yang
 * menerbitkan token, jadi klaim `iat` token dianggap masih di masa depan
 * (toleransi bawaan PostgREST 30 detik). Paling sering kena di query PERTAMA
 * setelah login/refresh token, karena penolakannya terjadi dalam ratusan
 * milidetik pertama umur token.
 */
export function isClockSkewError(error: QueryError): boolean {
  if (!error) return false;
  return error.code === "PGRST303" || /issued at future/i.test(error.message ?? "");
}

/** Jeda antar percobaan (ms). Ditambah jitter supaya tidak semua tab serempak. */
const RETRY_DELAYS_MS = [400, 1000, 2200, 4000];

/**
 * Ulangi query kalau ditolak karena clock skew, dengan jeda yang makin panjang.
 *
 * Sengaja TIDAK memanggil `supabase.auth.refreshSession()`: token baru punya
 * `iat` yang lebih baru lagi, jadi justru makin jauh di depan jam PostgREST.
 * Yang menyelesaikan masalahnya adalah menunggu jam validator menyusul, lalu
 * mengirim ulang token yang sama.
 *
 * `errorOf` mengambil error dari hasil `attempt` — supabase-js mengembalikan
 * `{ data, error }`, bukan melempar exception, dan satu load bisa berisi
 * beberapa query sekaligus.
 */
export async function withClockSkewRetry<T>(
  attempt: () => Promise<T>,
  errorOf: (result: T) => QueryError
): Promise<T> {
  let result = await attempt();
  for (const delay of RETRY_DELAYS_MS) {
    if (!isClockSkewError(errorOf(result))) return result;
    await new Promise((resolve) =>
      setTimeout(resolve, delay + Math.random() * 250)
    );
    result = await attempt();
  }
  return result;
}
