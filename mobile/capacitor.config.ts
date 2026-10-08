import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Skorupa ładuje program z serwera (ADR 0038), a nie z plików w aplikacji. Adres trafia do aplikacji przy
 * `npx cap sync`, więc do testów przestawia się go zmienną: CAP_SERVER_URL=http://localhost:3000 npx cap sync android.
 */
const url = process.env.CAP_SERVER_URL ?? "https://narzedziownikgp.pl";

const config: CapacitorConfig = {
  appId: "pl.narzedziownikgp.app",
  appName: "NarzędziownikGP",
  // Capacitor wymaga katalogu z index.html, choć przy server.url go nie pokazuje.
  webDir: "www",
  backgroundColor: "#eef0f3",
  server: {
    url,
    // Zwykły http tylko dla lokalnego serwera w testach; produkcja idzie po https.
    cleartext: url.startsWith("http://"),
  },
  plugins: {
    // Powiadomienie przychodzi na pasek także wtedy, gdy aplikacja jest otwarta, jak Web Push w przeglądarce.
    PushNotifications: { presentationOptions: ["alert"] },
  },
};

export default config;
