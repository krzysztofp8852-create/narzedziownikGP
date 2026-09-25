function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Brak zmiennej środowiskowej ${name} (zob. README)`);
  return value;
}

// NEXT_PUBLIC_* muszą być odczytane dosłownie, żeby Next wstawił je do kodu przeglądarki.
export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
};

export const serverEnv = {
  databaseUrl: () => required("DATABASE_URL", process.env.DATABASE_URL),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
};
