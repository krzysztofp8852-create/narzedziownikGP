/** Wypisuje, ile nagrań firmy (identyfikator w argumencie) leży w kubełku nagrań Supabase Storage. */
import { createClient } from "@supabase/supabase-js";
import { RECORDINGS_BUCKET } from "@/interpretation/transcription";
import { publicEnv, serverEnv } from "@/lib/env";

const companyId = process.argv[2];
const { data, error } = await createClient(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey())
  .storage.from(RECORDINGS_BUCKET)
  .list(companyId);
if (error) throw error;
console.log(data.length);
process.exit(0);
