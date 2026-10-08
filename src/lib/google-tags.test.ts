import { describe, expect, it } from "vitest";
import { googleTagsAllowed } from "./google-tags";

describe("Google Analytics tylko na produkcji", () => {
  it("wczytuje się na narzedziownikgp.pl", () => {
    expect(googleTagsAllowed("narzedziownikgp.pl")).toBe(true);
  });

  it("nie wczytuje się lokalnie, w testach ani na podglądach", () => {
    for (const hostname of ["localhost", "127.0.0.1", "narzedziownikgp.vercel.app", "narzedziownikgp-git-x.vercel.app", "narzedziownikgp.pl.example"]) {
      expect(googleTagsAllowed(hostname)).toBe(false);
    }
  });
});
