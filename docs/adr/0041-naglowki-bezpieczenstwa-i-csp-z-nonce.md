# 0041. Nagłówki bezpieczeństwa i CSP z nonce

Data: 2026-10-09 · Status: przyjęta (#141)

## Kontekst

Produkcja wysyłała tylko HSTS od Vercela. Strona przyjmuje dane firm, więc brak polityki treści (CSP), zakazu ramek
i polityki funkcji przeglądarki zostawiał otwarte XSS przez wstrzyknięty HTML, clickjacking i wyciek pełnych adresów
do innych stron. Nagłówki nie mogą zepsuć mapy Google, Google Analytics i Ads po zgodzie, service workera, Web Push,
aparatu, mikrofonu, położenia ani aplikacji Capacitor (ADR 0038).

## Decyzja

- **Stałe nagłówki każdej odpowiedzi** (`next.config.ts`, także pliki statyczne i `sw.js`): `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` i `Permissions-Policy`:
  aparat, mikrofon i położenie tylko `self`, reszta wyłączona (lista w `src/lib/security-headers.ts`, także
  funkcje reklamowe Privacy Sandbox, schowek i udostępnianie, których program nie używa). Wyjątek: `fullscreen=(self)`
  dla przycisku pełnego ekranu mapy budów.
- **CSP z nonce** w `src/proxy.ts`: nowy nonce przy każdym żądaniu, w nagłówku odpowiedzi i żądania; Next.js odczytuje
  go z żądania i dokłada swoim skryptom. `script-src` z `'strict-dynamic'`: skrypt z nonce może doczytać kolejne
  (gtag.js, Maps JavaScript API i ich moduły). Nie ma `'unsafe-inline'` dla skryptów, więc wstrzyknięty HTML
  z `onerror=` czy `<script>` się nie wykona. Wstawiony skrypt startowy gtag zastąpiła kolejka poleceń w kodzie
  (`startGoogleTags`).
- **Każda strona renderuje się na żądanie** (`connection()` w głównym layoucie): strona zbudowana z góry nie ma nonce.
  Dotyczy to też strony o programie, dokumentów prawnych i „Brak sieci”; proxy i tak obsługuje każde ich żądanie.
- **Najpierw tylko raport**: `Content-Security-Policy-Report-Only`, raporty idą na `/csp-raport` (`report-uri`
  i `Reporting-Endpoints`) i do logu Vercel bez zapytań w adresach. `CSP_ENFORCE=1` przełącza na
  `Content-Security-Policy`. Test dymny w CI ma politykę wymuszoną, więc każdy test e2e (mapa, skaner, nagranie,
  push) przechodzi przy blokowaniu.
- Wyjątki od ścisłej polityki: `'unsafe-eval'` i `blob:` w `script-src` oraz `worker-src blob:` (wymaga ich Maps
  JavaScript API według zaleceń Google; `next dev` też używa `eval`); `style-src 'unsafe-inline'` (atrybuty `style`
  z Reacta i style mapy; nonce nie obejmuje atrybutów).

### Dozwolone domeny

| Dyrektywa | Poza `'self'` |
| --- | --- |
| `script-src` | nonce, `'strict-dynamic'`, `'unsafe-eval'`, `blob:`; dla przeglądarek bez `'strict-dynamic'`: `maps.googleapis.com`, `www.googletagmanager.com`, `www.googleadservices.com`, `googleads.g.doubleclick.net`, `www.google.com` |
| `style-src` | `'unsafe-inline'`, `fonts.googleapis.com` |
| `img-src` | `blob:`, `data:`, `*.googleapis.com`, `*.gstatic.com`, `*.google.com`, `*.googleusercontent.com`, `www.googletagmanager.com`, `*.google-analytics.com`, `www.googleadservices.com`, `*.g.doubleclick.net`, `pagead2.googlesyndication.com`, `www.google.pl` |
| `connect-src` | `data:`, `blob:`, `*.googleapis.com`, `*.gstatic.com`, `*.google.com`, `www.googletagmanager.com`, `*.google-analytics.com`, `*.analytics.google.com`, `www.googleadservices.com`, `*.g.doubleclick.net`, `ad.doubleclick.net`, `pagead2.googlesyndication.com`, `www.google.pl` |
| `font-src` | `fonts.gstatic.com` |
| `media-src` | `blob:` |
| `worker-src` | `blob:` |
| `frame-src` | `*.google.com`, `www.googletagmanager.com` |
| zakazy | `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` |

Wszystkie domeny po `https://`. Mapa: zalecenia Google „Content Security Policy” dla Maps JavaScript API. Analytics 4
i konwersje Ads: przewodnik CSP Google Tag Platform; `google.<TLD>` trzeba wypisać po kolei, więc jest tylko
`www.google.pl`. Supabase, OpenAI, ElevenLabs, Resend i FCM woła tylko serwer, więc ich w polityce nie ma. Zdjęcie
z aparatu w aplikacji (`/_capacitor_file_/…`) jest pod adresem strony.

## Odrzucone alternatywy

- **`'unsafe-inline'` zamiast nonce**: strony zostałyby statyczne, ale polityka nie chroniłaby przed wstrzykniętym
  skryptem, czyli przed tym, po co jest.
- **Hashe skryptów (SRI, eksperymentalne w Next.js)**: nie obejmuje skryptów danych RSC wstawianych w stronę przy
  renderowaniu na żądanie, a większość stron i tak jest dynamiczna (sesja w ciasteczkach).
- **Od razu wymuszona polityka**: atrapa mapy w teście nie sprawdza prawdziwego Maps JavaScript API ani gtag.js, więc
  brakującą domenę pokaże dopiero ruch z produkcji.

## Konsekwencje

- Strona o programie i dokumenty prawne renderują się przy każdym wejściu, a nie z CDN.
- Nowa usługa w przeglądarce (skrypt, obraz, połączenie z inną domeną) wymaga dopisania domeny w
  `src/lib/security-headers.ts` i tutaj; inaczej po wymuszeniu przestanie działać.
- Przed `CSP_ENFORCE=1` na produkcji: log „Naruszenie CSP” czysty po tygodniu ruchu, w tym otwarciu mapy budów
  z prawdziwym kluczem, zgodzie na Analytics i używaniu aplikacji na Androidzie (most Capacitora w starszym WebView
  może wstawiać skrypt bez nonce; test dymny sprawdza tylko atrapę mostu w Chrome).
- Kopie tablicy i „Brak sieci” w service workerze mają nagłówki z chwili zapisu, więc po przełączeniu trybu jeszcze
  raz raportują albo blokują po staremu, dopóki się nie odświeżą.
