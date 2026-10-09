package pl.narzedziownikgp.app;

import android.net.Uri;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Nazwa pliku w „Pobranych”: ta, którą podał serwer albo strona, z rozszerzeniem pasującym do typu, żeby telefon wiedział,
 * czym plik otworzyć.
 */
final class DownloadFileName {

    private static final String FALLBACK = "plik";
    /** `filename*=UTF-8''…` (RFC 6266): nazwa z polskimi znakami, jak w dokumentach terminów i uprawnień. */
    private static final Pattern EXTENDED = Pattern.compile("(?i)(?:^|;)\\s*filename\\*\\s*=\\s*[^';]*'[^']*'([^;\\s]+)");
    /** `filename="…"` albo `filename=…`. */
    private static final Pattern PLAIN = Pattern.compile("(?i)(?:^|;)\\s*filename\\s*=\\s*(?:\"((?:[^\"\\\\]|\\\\.)*)\"|([^;\\s]+))");
    /** Znaki, których Android nie przyjmie w nazwie pliku, i ukośniki, przez które nazwa wyszłaby z „Pobranych”. */
    private static final Pattern UNSAFE = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    private DownloadFileName() {}

    /** Plik z adresu: nazwa z nagłówka Content-Disposition, a bez niej z adresu (np. `zdjecie.jpg`). */
    static String forUrl(String url, String contentDisposition, String mimeType) {
        String name = fromContentDisposition(contentDisposition);
        return clean(name != null ? name : URLUtil.guessFileName(url, null, mimeType), mimeType);
    }

    /** Plik z pamięci strony: nazwa z atrybutu `download` linku, jeśli strona go zostawiła. */
    static String forPageFile(String suggested, String mimeType) {
        return clean(suggested == null ? "" : suggested, mimeType);
    }

    /** Typ bez parametrów (`text/csv; charset=utf-8` → `text/csv`); bez typu ogólny strumień bajtów. */
    static String mimeType(String raw) {
        if (raw == null || raw.isBlank()) {
            return "application/octet-stream";
        }
        int parameters = raw.indexOf(';');
        return (parameters < 0 ? raw : raw.substring(0, parameters)).trim().toLowerCase(Locale.ROOT);
    }

    static String fromContentDisposition(String header) {
        if (header == null) {
            return null;
        }
        Matcher extended = EXTENDED.matcher(header);
        if (extended.find()) {
            // Uri.decode, a nie URLDecoder: „+” w nazwie zostaje plusem.
            return Uri.decode(extended.group(1));
        }
        Matcher plain = PLAIN.matcher(header);
        if (plain.find()) {
            return plain.group(1) != null ? plain.group(1).replaceAll("\\\\(.)", "$1") : plain.group(2);
        }
        return null;
    }

    private static String clean(String name, String mimeType) {
        String safe = UNSAFE.matcher(name).replaceAll("_").trim().replaceFirst("^\\.+", "");
        if (safe.isEmpty()) {
            safe = FALLBACK;
        }
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (extension != null && !safe.contains(".")) {
            safe = safe + "." + extension;
        }
        return safe;
    }
}
