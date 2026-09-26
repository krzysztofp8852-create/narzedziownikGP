/**
 * Układy arkuszy A4 z gotowymi naklejkami: kolumny i wiersze naklejek o podanym rozmiarze (mm),
 * stykających się ze sobą i wyśrodkowanych na arkuszu, jak w popularnych arkuszach etykiet.
 */
export const STICKER_LAYOUTS = {
  "a4-24": { columns: 3, rows: 8, width: 70, height: 37 },
  "a4-21": { columns: 3, rows: 7, width: 70, height: 42.3 },
  "a4-40": { columns: 4, rows: 10, width: 52.5, height: 29.7 },
  "a4-8": { columns: 2, rows: 4, width: 105, height: 74 },
} as const;

export type StickerLayoutId = keyof typeof STICKER_LAYOUTS;

export function isStickerLayout(id: string): id is StickerLayoutId {
  return Object.hasOwn(STICKER_LAYOUTS, id);
}

export function stickersPerSheet(layoutId: StickerLayoutId) {
  const layout = STICKER_LAYOUTS[layoutId];
  return layout.columns * layout.rows;
}

/** Czy na arkuszu tego układu jest miejsce o tym numerze (od 1). */
export function isStickerPosition(layoutId: StickerLayoutId, position: number) {
  return Number.isInteger(position) && position >= 1 && position <= stickersPerSheet(layoutId);
}
