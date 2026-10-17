import { describe, expect, it } from "vitest";
import { posterUrl } from "@/posters/url";
import { stickerUrl } from "@/stickers/url";
import { recognizeCode } from "./scanned-code";

const POSTER = "7K3MQ9XZ2B";
const H03 = "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102";
const S01 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const tools = [
  { id: H03, code: "H-03" },
  { id: S01, code: "S01" },
];

describe("rozpoznanie kodu w Skanuj", () => {
  it("kod QR plakatu budowy to odbicie, z dowolnej domeny aplikacji i w każdym zapisie", () => {
    expect(recognizeCode(posterUrl("https://narzedziownikgp.pl", POSTER), tools)).toEqual({ kind: "plakat", code: POSTER });
    expect(recognizeCode("http://localhost:3000/odbicie/7k3mq9xz2b", tools)).toEqual({ kind: "plakat", code: POSTER });
  });

  it("kod plakatu wpisany ręcznie: małe litery, spacje, myślnik i mylone znaki", () => {
    for (const typed of ["7K3MQ-9XZ2B", " 7k3mq-9xz2b ", "7k3mq 9xz2b", "7K3MQ9XZ2B"]) {
      expect(recognizeCode(typed, tools)).toEqual({ kind: "plakat", code: POSTER });
    }
    expect(recognizeCode("o1234-5678l", tools)).toEqual({ kind: "plakat", code: "0123456781" });
  });

  it("kod QR naklejki to narzędzie, także spoza tablicy (czy jest w firmie, sprawdza dalszy krok)", () => {
    expect(recognizeCode(stickerUrl("https://narzedziownikgp.pl", H03), tools)).toEqual({ kind: "narzedzie", toolId: H03 });
    const elsewhere = "11111111-2222-4333-8444-555555555555";
    expect(recognizeCode(stickerUrl("http://localhost:3000", elsewhere), tools)).toEqual({ kind: "narzedzie", toolId: elsewhere });
  });

  it("kod narzędzia wpisany ręcznie: małe litery, spacje i bez kreski", () => {
    for (const typed of ["H-03", "h-03", " h 03 ", "H03"]) {
      expect(recognizeCode(typed, tools)).toEqual({ kind: "narzedzie", toolId: H03 });
    }
    expect(recognizeCode("s-01", tools)).toEqual({ kind: "narzedzie", toolId: S01 });
  });

  it("obcy kod nie jest ani plakatem, ani narzędziem", () => {
    for (const text of [
      "https://example.com/",
      "https://narzedziownikgp.pl/narzedzia/nie-uuid",
      "https://narzedziownikgp.pl/odbicie/7K3MQ9XZ2B/x",
      "WIFI:S:budowa;T:WPA;P:haslo;;",
      "X-99",
      "H-3",
      "H",
      "7K3MQ9XZ2U",
      "",
      "   ",
    ]) {
      expect(recognizeCode(text, tools)).toEqual({ kind: "nierozpoznany" });
    }
  });

  it("adres z kodem narzędzia nie udaje wpisanego kodu", () => {
    expect(recognizeCode("https://example.com/H-03", tools)).toEqual({ kind: "nierozpoznany" });
  });
});
