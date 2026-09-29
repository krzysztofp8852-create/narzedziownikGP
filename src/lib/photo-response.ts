/** Zdjęcie z prywatnego kubełka dla tego, kto może je zobaczyć. Przeglądarka trzyma je u siebie, a nie w pamięciach pośrednich. */
export function photoResponse(photo: Blob | null): Response {
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo, {
    headers: {
      "Content-Type": photo.type || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Dokument terminu (PDF albo zdjęcie) dla tego, kto może go zobaczyć, z nazwą pliku do zapisania. Typ ustalił Rejestr
 * z treści pliku, a `nosniff` nie pozwala przeglądarce uznać go za stronę. Bez CSP `sandbox`, bo przy nim Chrome nie
 * pokazuje PDF-a.
 */
export function documentResponse(document: { file: Blob; fileName: string } | null): Response {
  if (!document) return new Response(null, { status: 404 });
  const asciiName = document.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(document.file, {
    headers: {
      "Content-Type": document.file.type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
