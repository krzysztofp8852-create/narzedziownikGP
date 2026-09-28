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
