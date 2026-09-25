import { createClient } from "@supabase/supabase-js";
import { type AuthAdmin, EmailTakenError } from "./ports";

/** AuthAdmin na API administracyjnym Supabase Auth (klucz service_role, tylko serwer). */
export function createSupabaseAuthAdmin(url: string, serviceRoleKey: string): AuthAdmin {
  const { auth } = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async createUser({ email, password }) {
      const { data, error } = await auth.admin.createUser({ email, password, email_confirm: true });
      if (error?.code === "email_exists") throw new EmailTakenError(email);
      if (error) throw error;
      return { userId: data.user.id };
    },
    async setPassword(userId, password) {
      const { error } = await auth.admin.updateUserById(userId, { password });
      if (error) throw error;
    },
    async blockSignIn(userId) {
      // Supabase nie ma blokady bezterminowej; sto lat wystarcza.
      const { error } = await auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (error) throw error;
    },
    async deleteUser(userId) {
      const { error } = await auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}
