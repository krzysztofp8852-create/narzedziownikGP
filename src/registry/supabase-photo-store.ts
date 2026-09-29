import { createClient } from "@supabase/supabase-js";
import type { PhotoStore } from "./ports";

/**
 * Prywatne kubełki Supabase Storage na zdjęcia i dokumenty (migracje `issues`, `support_chat` i `tool_deadlines`); dostęp
 * ma tylko serwer z kluczem service_role.
 */
export const ISSUE_PHOTOS_BUCKET = "zdjecia-zgloszen";
export const CHAT_PHOTOS_BUCKET = "zdjecia-czatu";
export const DEADLINE_DOCUMENTS_BUCKET = "dokumenty-narzedzi";

/** Zdjęcia zgłoszeń, czatu albo dokumenty terminów w kubełku Supabase Storage. */
export function createSupabasePhotoStore(
  url: string,
  serviceRoleKey: string,
  bucketName: typeof ISSUE_PHOTOS_BUCKET | typeof CHAT_PHOTOS_BUCKET | typeof DEADLINE_DOCUMENTS_BUCKET,
): PhotoStore {
  const bucket = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from(bucketName);
  return {
    async save(key, photo) {
      const { error } = await bucket.upload(key, photo, { contentType: photo.type, upsert: false });
      if (error) throw error;
    },
    async read(key) {
      const { data, error } = await bucket.download(key);
      if (error) {
        // Brak pliku to brak zdjęcia (dokumentu); inne błędy (Storage nie odpowiada) zgłaszamy.
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
