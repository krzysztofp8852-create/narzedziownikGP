import "server-only";
import { createClient } from "@supabase/supabase-js";
import { RECORDINGS_BUCKET, type RecordingStore, recordingType } from "./transcription";

/** Kubełek nagrań w Supabase Storage. Nagranie leży w nim tylko na czas transkrypcji. */
export function createSupabaseRecordingStore(url: string, serviceRoleKey: string): RecordingStore {
  const bucket = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from(RECORDINGS_BUCKET);
  return {
    async save(key, audio) {
      const { error } = await bucket.upload(key, audio, { contentType: recordingType(audio) ?? audio.type, upsert: false });
      if (error) throw error;
    },
    async remove(key) {
      const { error } = await bucket.remove([key]);
      if (error) throw error;
    },
  };
}
