import { randomInt } from "node:crypto";

// Bez znaków łatwych do pomylenia przy przepisywaniu z kartki (0/O, 1/l/I).
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 12;

export function generateTemporaryPassword(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
