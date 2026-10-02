import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { type PDFFont, type PDFPage, PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";

export interface PosterInput {
  companyName: string;
  /** „Budowa” albo „Baza”. */
  kindLabel: string;
  placeName: string;
  address: string;
  /** Adres strony odbicia w kodzie QR. */
  url: string;
  /** Kod plakatu do wpisania ręcznie, np. „7K3MQ-9XZ2B”. */
  code: string;
  /** Teksty plakatu z pliku tłumaczeń. */
  texts: { heading: string; codeLabel: string; instructions: string[] };
}

const A4 = { width: 210, height: 297 };
const PT_PER_MM = 72 / 25.4;
const MARGIN_MM = 15;
const QR_SIZE_MM = 110;
/** Pusty pas wokół kodu QR: skaner potrzebuje ok. 4 modułów wolnego miejsca. */
const QR_QUIET_MM = 10;
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.35, 0.35, 0.35);

const FONTS_DIR = join(process.cwd(), "src/stickers/fonts");

/**
 * Plakat budowy albo bazy na A4: nazwa miejsca, duży kod QR z adresem strony odbicia, kod do wpisania ręcznie
 * i krótka instrukcja. Bez identyfikatora budowy: kod QR niesie tylko kod plakatu.
 */
export async function posterPdf(input: PosterInput): Promise<Uint8Array> {
  if (!input.placeName.trim() || !input.code.trim()) throw new Error("Plakat bez nazwy miejsca albo kodu");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [codeFont, textFont] = await Promise.all([
    readFile(join(FONTS_DIR, "JetBrainsMono-Bold.ttf")).then((bytes) => pdf.embedFont(bytes, { subset: true })),
    readFile(join(FONTS_DIR, "Barlow-SemiBold.ttf")).then((bytes) => pdf.embedFont(bytes, { subset: true })),
  ]);
  pdf.setTitle(`${input.kindLabel} ${input.placeName}`);
  const page = pdf.addPage([A4.width * PT_PER_MM, A4.height * PT_PER_MM]);
  const width = A4.width - 2 * MARGIN_MM;
  let y = MARGIN_MM;

  const line = (text: string, font: PDFFont, size: number, color = INK) => {
    const fitted = truncate(font, text, width, size);
    drawText(page, fitted, { x: centered(font, fitted, size), baseline: y + size * 0.8, size, font, color });
    y += size * 1.3;
  };

  line(input.companyName, textFont, 6, MUTED);
  line(input.kindLabel.toUpperCase(), textFont, 8);
  line(input.placeName, textFont, Math.max(9, fitSize(textFont, input.placeName, width, 16)));
  line(input.address, textFont, 5.5, MUTED);
  y += 4;
  line(input.texts.heading, textFont, 8);

  const { modules } = QRCode.create(input.url, { errorCorrectionLevel: "M" });
  y += QR_QUIET_MM;
  drawQr(page, { x: (A4.width - QR_SIZE_MM) / 2, y, size: QR_SIZE_MM }, modules);
  y += QR_SIZE_MM + QR_QUIET_MM;
  line(`${input.texts.codeLabel} ${input.code}`, codeFont, 8);
  y += 2;

  for (const instruction of input.texts.instructions) {
    for (const wrapped of wrap(textFont, instruction, width, 5)) line(wrapped, textFont, 5);
    y += 1.5;
  }
  return pdf.save();
}

function centered(font: PDFFont, text: string, size: number) {
  return (A4.width - font.widthOfTextAtSize(text, size * PT_PER_MM) / PT_PER_MM) / 2;
}

/** Rozmiar czcionki (mm), przy którym tekst zajmuje szerokość, ale nie więcej niż `max`. */
function fitSize(font: PDFFont, text: string, width: number, max: number) {
  const widthAtOneMm = font.widthOfTextAtSize(text, PT_PER_MM) / PT_PER_MM;
  return widthAtOneMm > 0 ? Math.min(max, width / widthAtOneMm) : max;
}

const fits = (font: PDFFont, text: string, width: number, size: number) => font.widthOfTextAtSize(text, size * PT_PER_MM) / PT_PER_MM <= width;

/** Tekst ucięty wielokropkiem tak, żeby w tym rozmiarze zmieścił się w szerokości. */
function truncate(font: PDFFont, text: string, width: number, size: number) {
  if (fits(font, text, width, size)) return text;
  let chars = [...text];
  while (chars.length > 0 && !fits(font, `${chars.join("").trimEnd()}…`, width, size)) chars = chars.slice(0, -1);
  return `${chars.join("").trimEnd()}…`;
}

/** Wiersze tekstu łamanego na słowach tak, żeby każdy mieścił się w szerokości. */
function wrap(font: PDFFont, text: string, width: number, size: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && !fits(font, candidate, width, size)) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawText(page: PDFPage, text: string, at: { x: number; baseline: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }) {
  page.drawText(text, {
    x: at.x * PT_PER_MM,
    y: page.getHeight() - at.baseline * PT_PER_MM,
    size: at.size * PT_PER_MM,
    font: at.font,
    color: at.color,
  });
}

/** Kod QR jako wektor, ciemne moduły sklejone w poziome odcinki jednej ścieżki (jak na naklejkach). */
function drawQr(page: PDFPage, box: { x: number; y: number; size: number }, modules: QRCode.BitMatrix) {
  let path = "";
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; ) {
      if (!modules.get(row, column)) {
        column++;
        continue;
      }
      const start = column;
      while (column < modules.size && modules.get(row, column)) column++;
      path += `M${start} ${row}h${column - start}v1h${start - column}z`;
    }
  }
  page.drawSvgPath(path, {
    x: box.x * PT_PER_MM,
    y: page.getHeight() - box.y * PT_PER_MM,
    scale: (box.size / modules.size) * PT_PER_MM,
    color: INK,
    borderWidth: 0,
  });
}
