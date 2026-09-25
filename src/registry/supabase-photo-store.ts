import { createClient } from "@supabase/supabase-js";
import type { PhotoStore } from "./ports";
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from "./tools";

const BUCKET = "tool-photos";
const URL_TTL_SECONDS = 10 * 60;

/**
 * Zdjęcia narzędzi w prywatnym kubełku Supabase Storage. Kubełek nie ma polityk
 * dla `anon` ani `authenticated`, więc przeglądarka nie dostanie się do niego sama.
 * Serwer (klucz service_role) zapisuje pliki i wydaje krótko ważne adresy dopiero
 * wtedy, gdy Rejestr pod RLS pokazał użytkownikowi kartę narzędzia jego firmy.
 */
export function createSupabasePhotoStore(url: string, serviceRoleKey: string): PhotoStore {
  const { storage } = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bucket = () => storage.from(BUCKET);

  // Kubełek zakładamy przy pierwszym zdjęciu, żeby każde środowisko (lokalne, chmura) działało bez ręcznych kroków.
  async function createBucket() {
    const { error } = await storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: PHOTO_CONTENT_TYPES,
    });
    if (error && (error as { code?: string }).code !== "ResourceAlreadyExists") throw error;
  }

  const upload = (path: string, bytes: Uint8Array, contentType: string) =>
    bucket().upload(path, bytes, { contentType, upsert: false });

  return {
    async put(path, photo) {
      let { error } = await upload(path, photo.bytes, photo.contentType);
      if (error && isMissingBucket(error)) {
        await createBucket();
        ({ error } = await upload(path, photo.bytes, photo.contentType));
      }
      if (error) throw error;
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) throw error;
    },
    async url(path) {
      const { data, error } = await bucket().createSignedUrl(path, URL_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}

function isMissingBucket(error: { message: string; code?: string }) {
  return error.code === "NoSuchBucket" || /bucket not found/i.test(error.message);
}
