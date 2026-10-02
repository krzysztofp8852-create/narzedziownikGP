import { describe, expect, it } from "vitest";
import { formatPosterCode, posterUrl, readPoster } from "./url";

const CODE = "7K3MQ9XZ2B";

describe("adres w kodzie QR plakatu budowy", () => {
  it("prowadzi do strony odbicia po kodzie plakatu, a nie po identyfikatorze budowy", () => {
    expect(posterUrl("https://narzedziownikgp.pl", CODE)).toBe("https://narzedziownikgp.pl/odbicie/7K3MQ9XZ2B");
    expect(posterUrl("https://narzedziownikgp.pl/", CODE)).toBe("https://narzedziownikgp.pl/odbicie/7K3MQ9XZ2B");
  });

  it("skaner odczytuje kod z adresu plakatu albo z kodu wpisanego ręcznie", () => {
    expect(readPoster(posterUrl("https://narzedziownikgp.pl", CODE))).toEqual({ code: CODE });
    expect(readPoster("http://localhost:3000/odbicie/7k3mq9xz2b")).toEqual({ code: CODE });
    expect(readPoster(" 7k3mq-9xz2b ")).toEqual({ code: CODE });
    expect(readPoster("7K3MQ 9XZ2B")).toEqual({ code: CODE });
  });

  it("mylone znaki wpisane ręcznie znaczą to samo co na plakacie", () => {
    expect(readPoster("O1234-5678L")).toEqual({ code: "0123456781" });
    expect(readPoster("o1234-5678i")).toEqual({ code: "0123456781" });
  });

  it("naklejka narzędzia, obcy adres i za krótki kod nie są plakatem", () => {
    expect(readPoster("https://narzedziownikgp.pl/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102")).toBeNull();
    expect(readPoster("https://example.com/")).toBeNull();
    expect(readPoster("https://narzedziownikgp.pl/odbicie/7K3MQ9XZ2B/x")).toBeNull();
    expect(readPoster("H-03")).toBeNull();
    expect(readPoster("7K3MQ9XZ2BB")).toBeNull();
    expect(readPoster("7K3MQ9XZ2U")).toBeNull();
    expect(readPoster("")).toBeNull();
  });

  it("na plakacie kod jest w dwóch grupach po pięć znaków", () => {
    expect(formatPosterCode(CODE)).toBe("7K3MQ-9XZ2B");
  });
});
