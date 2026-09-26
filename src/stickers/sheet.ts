import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { type PDFFont, type PDFPage, PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { isStickerPosition, STICKER_LAYOUTS, type StickerLayoutId, stickersPerSheet } from "./layouts";

export interface StickerSheetInput {
  /** Nazwa firmy na każdej naklejce. */
  companyName: string;
  /** W kolejności druku: wierszami, od lewego górnego rogu. */
  stickers: { code: string; url: string }[];
  layout: StickerLayoutId;
  /** Miejsce pierwszej naklejki na arkuszu (od 1), żeby dodrukować na napoczętym arkuszu. Domyślnie 1. */
  firstPosition?: number;
}

const A4 = { width: 210, height: 297 };
const PT_PER_MM = 72 / 25.4;
/** Odstęp treści od brzegu naklejki: drukarki nie drukują przy samej krawędzi arkusza. */
const PADDING_MM = 3;
const INK = rgb(0, 0, 0);

const FONTS_DIR = join(process.cwd(), "src/stickers/fonts");

/** PDF z naklejkami QR: kod QR z adresem, duży kod narzędzia i nazwa firmy. */
export async function stickerSheetPdf(input: StickerSheetInput): Promise<Uint8Array> {
  const firstPosition = input.firstPosition ?? 1;
  if (input.stickers.length === 0 || !isStickerPosition(input.layout, firstPosition)) {
    throw new Error("Zły arkusz naklejek");
  }
  const layout = STICKER_LAYOUTS[input.layout];
  const perSheet = stickersPerSheet(input.layout);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [codeFont, nameFont] = await Promise.all([
    readFile(join(FONTS_DIR, "JetBrainsMono-Bold.ttf")).then((bytes) => pdf.embedFont(bytes, { subset: true })),
    readFile(join(FONTS_DIR, "Barlow-SemiBold.ttf")).then((bytes) => pdf.embedFont(bytes, { subset: true })),
  ]);

  const left = (A4.width - layout.columns * layout.width) / 2;
  const top = (A4.height - layout.rows * layout.height) / 2;
  let page: PDFPage | undefined;
  for (const [index, sticker] of input.stickers.entries()) {
    const slot = (firstPosition - 1 + index) % perSheet;
    if (slot === 0 || !page) page = pdf.addPage([A4.width * PT_PER_MM, A4.height * PT_PER_MM]);
    const box = {
      x: left + (slot % layout.columns) * layout.width,
      y: top + Math.floor(slot / layout.columns) * layout.height,
      width: layout.width,
      height: layout.height,
    };
    drawSticker(page, box, { ...sticker, companyName: input.companyName }, { codeFont, nameFont });
  }
  return pdf.save();
}

/** Prostokąt w mm od lewego górnego rogu arkusza. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function drawSticker(
  page: PDFPage,
  box: Box,
  sticker: { code: string; url: string; companyName: string },
  fonts: { codeFont: PDFFont; nameFont: PDFFont },
) {
  const inner = {
    x: box.x + PADDING_MM,
    y: box.y + PADDING_MM,
    width: box.width - 2 * PADDING_MM,
    height: box.height - 2 * PADDING_MM,
  };
  // Kod QR z lewej, kwadratowy; na szerokiej naklejce nie więcej niż połowa szerokości.
  const { modules } = QRCode.create(sticker.url, { errorCorrectionLevel: "M" });
  const qrSize = Math.min(inner.height, inner.width / 2);
  drawQr(page, { x: inner.x, y: inner.y + (inner.height - qrSize) / 2, width: qrSize, height: qrSize }, modules);

  // Tekst dalej niż 4 moduły od kodu QR: tyle pustego miejsca wokół kodu potrzebuje skaner.
  const gap = (QUIET_ZONE_MODULES * qrSize) / modules.size;
  const text = { x: inner.x + qrSize + gap, width: inner.width - qrSize - gap };
  // Czcionka stała: krótkie kody mają rozmiar jak pięcioznakowe, żeby naklejki arkusza wyglądały jednakowo.
  const codeSize = fitSize(fonts.codeFont, sticker.code.padEnd(CODE_MIN_CHARS, "0"), text.width, inner.height * 0.45);
  const nameSize = Math.max(
    MIN_NAME_SIZE_MM,
    fitSize(fonts.nameFont, sticker.companyName, text.width, Math.min(codeSize * 0.45, inner.height * 0.2)),
  );
  const name = truncate(fonts.nameFont, sticker.companyName, text.width, nameSize);

  // Kod i nazwa firmy razem, wyśrodkowane w pionie; wysokość kodu to wysokość wielkich liter.
  const codeHeight = fonts.codeFont.heightAtSize(codeSize * PT_PER_MM, { descender: false }) / PT_PER_MM;
  const lineGap = codeHeight * 0.35;
  const blockTop = inner.y + (inner.height - (codeHeight + lineGap + nameSize)) / 2;
  drawText(page, sticker.code, { x: text.x, baseline: blockTop + codeHeight, size: codeSize, font: fonts.codeFont });
  drawText(page, name, { x: text.x, baseline: blockTop + codeHeight + lineGap + nameSize * 0.8, size: nameSize, font: fonts.nameFont });
}

const CODE_MIN_CHARS = 5;
const QUIET_ZONE_MODULES = 4;
/** Najmniejsza czytelna nazwa firmy (ok. 5,7 pt); dłuższa nazwa jest ucinana. */
const MIN_NAME_SIZE_MM = 2;

/** Rozmiar czcionki (mm), przy którym tekst zajmuje szerokość, ale nie więcej niż `max`. */
function fitSize(font: PDFFont, text: string, width: number, max: number) {
  const widthAtOneMm = font.widthOfTextAtSize(text, PT_PER_MM) / PT_PER_MM;
  return widthAtOneMm > 0 ? Math.min(max, width / widthAtOneMm) : max;
}

/** Tekst ucięty wielokropkiem tak, żeby w tym rozmiarze zmieścił się w szerokości. */
function truncate(font: PDFFont, text: string, width: number, size: number) {
  const fits = (value: string) => font.widthOfTextAtSize(value, size * PT_PER_MM) / PT_PER_MM <= width;
  if (fits(text)) return text;
  let chars = [...text];
  while (chars.length > 0 && !fits(`${chars.join("").trimEnd()}…`)) chars = chars.slice(0, -1);
  return `${chars.join("").trimEnd()}…`;
}

function drawText(page: PDFPage, text: string, at: { x: number; baseline: number; size: number; font: PDFFont }) {
  page.drawText(text, {
    x: at.x * PT_PER_MM,
    y: page.getHeight() - at.baseline * PT_PER_MM,
    size: at.size * PT_PER_MM,
    font: at.font,
    color: INK,
  });
}

/**
 * Kod QR jako wektor: ciemne moduły sklejone w poziome odcinki, wszystkie w jednej ścieżce,
 * żeby przy rasteryzacji nie było jasnych szczelin między sąsiednimi modułami.
 */
function drawQr(page: PDFPage, box: Box, modules: QRCode.BitMatrix) {
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
  // Ścieżka w jednostkach modułu, z osią y w dół jak w SVG, od lewego górnego rogu kodu.
  page.drawSvgPath(path, {
    x: box.x * PT_PER_MM,
    y: page.getHeight() - box.y * PT_PER_MM,
    scale: (box.width / modules.size) * PT_PER_MM,
    color: INK,
    borderWidth: 0,
  });
}
