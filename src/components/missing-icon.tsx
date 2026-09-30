/** Ikona zgłoszonego braku lub zaginięcia (tablica, zgłoszenia); ozdobna, bo obok zawsze jest tekst. */
export function MissingIcon() {
  return (
    <svg
      className="missing-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="m13.5 8.5-5 5" />
      <path d="m8.5 8.5 5 5" />
    </svg>
  );
}
