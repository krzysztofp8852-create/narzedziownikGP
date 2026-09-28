import { createClient } from "@supabase/supabase-js";
import type { PhotoStore } from "./ports";

/** Prywatny kubełek Supabase Storage na zdjęcia zgłoszeń (migracja `issues`); dostęp ma tylko serwer z kluczem service_role. */
export const ISSUE_PHOTOS_BUCKET = "zdjecia-zgloszen";

/** Zdjęcia zgłoszeń w Supabase Storage. */
export function createSupabasePhotoStore(url: string, serviceRoleKey: string): PhotoStore {
  const bucket = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from(ISSUE_PHOTOS_BUCKET);
  return {
    async save(key, photo) {
      const { error } = await bucket.upload(key, photo, { contentType: photo.type, upsert: false });
      if (error) throw error;
    },
    async read(key) {
      const { data, error } = await bucket.download(key);
      if (error) {
        // Brak pliku to brak zdjęcia; inne błędy (Storage nie odpowiada) zgłaszamy.
        if (error.status === 404 || error.statusCode === "404") return null;
        throw error;
      }
      return data;
    },
    async remove(key) {
      const { error } = await bucket.remove([key]);
      if (error) throw error;
    },
  };
}
