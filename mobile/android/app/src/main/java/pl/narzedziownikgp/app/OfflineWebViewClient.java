package pl.narzedziownikgp.app;

import android.graphics.Bitmap;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Gdy program nie wczyta się z sieci (np. pierwsze uruchomienie bez zasięgu, zanim service worker cokolwiek
 * zapamiętał), skorupa pokazuje własny ekran „Brak połączenia” zamiast technicznego błędu WebView. Po pierwszym udanym
 * starcie bez sieci odpowiada service worker (ADR 0010), więc ten ekran się już nie pojawia.
 *
 * Tylko błędy sieci głównej ramki: odpowiedzi HTTP 4xx i 5xx (strony „nie znaleziono” i „brak dostępu” programu)
 * zostają w programie, dlatego nie `errorPath` Capacitora (zob. ADR 0038). WebView zgłasza kolejno onPageStarted,
 * onReceivedError i onPageFinished dla tego samego adresu.
 */
public class OfflineWebViewClient extends BridgeWebViewClient {

    private static final String OFFLINE_PAGE_ASSET = "brak-polaczenia.html";
    private static final String ADDRESS_PLACEHOLDER = "__ADRES__";

    private boolean offlinePageShown;
    private boolean currentLoadFailed;
    /** Do pierwszego udanego wczytania programu historia WebView to same nieudane próby. */
    private boolean programLoaded;

    public OfflineWebViewClient(Bridge bridge) {
        super(bridge);
    }

    /** Na ekranie „Brak połączenia” „wstecz” zamyka aplikację: cofnięcie trafiłoby w nieudaną próbę i wróciło tutaj. */
    public boolean isOfflinePageShown() {
        return offlinePageShown;
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        if (isWebUrl(url)) {
            offlinePageShown = false;
            currentLoadFailed = false;
        }
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (!request.isForMainFrame() || !isNetworkError(error.getErrorCode())) {
            return;
        }
        String failedUrl = request.getUrl().toString();
        Logger.debug("Brak połączenia z " + failedUrl + ": " + error.getErrorCode() + " " + error.getDescription());
        String page = offlinePage(view, failedUrl);
        if (page == null) {
            return;
        }
        currentLoadFailed = true;
        offlinePageShown = true;
        view.stopLoading();
        // Bez adresu bazowego (about:blank): strona nie ma pochodzenia programu, więc nie dostaje mostka Capacitora.
        view.loadDataWithBaseURL(null, page, "text/html", "utf-8", failedUrl);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (!programLoaded && isWebUrl(url) && !currentLoadFailed) {
            programLoaded = true;
            // Po „Spróbuj ponownie” przy starcie „wstecz” nie ma wracać do nieudanych prób.
            view.clearHistory();
        }
    }

    /**
     * Brak zasięgu, serwer nieosiągalny albo zerwane połączenie. Inne błędy (np. blokada Bezpiecznego przeglądania,
     * brak strony w pamięci przy cofnięciu do formularza) zostają przy stronie błędu WebView, bo „sprawdź zasięg” by
     * w nich nie pomogło.
     */
    private static boolean isNetworkError(int errorCode) {
        return switch (errorCode) {
            case WebViewClient.ERROR_HOST_LOOKUP,
                WebViewClient.ERROR_CONNECT,
                WebViewClient.ERROR_TIMEOUT,
                WebViewClient.ERROR_IO,
                WebViewClient.ERROR_FAILED_SSL_HANDSHAKE -> true;
            default -> false;
        };
    }

    private static boolean isWebUrl(String url) {
        return url != null && (url.startsWith("https://") || url.startsWith("http://"));
    }

    /**
     * Strona z assets z adresem do ponowienia jako literał JS. JSONObject.quote zamienia też „/” w „\/”, więc adres nie
     * zamknie znacznika `</script>`.
     */
    private static String offlinePage(WebView view, String failedUrl) {
        try (InputStream stream = view.getContext().getAssets().open(OFFLINE_PAGE_ASSET)) {
            // InputStream.readAllBytes dopiero od Androida 13, a minSdk to 24.
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int read; (read = stream.read(buffer)) != -1; ) {
                bytes.write(buffer, 0, read);
            }
            String template = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            return template.replace(ADDRESS_PLACEHOLDER, JSONObject.quote(failedUrl));
        } catch (IOException ex) {
            Logger.error("Nie wczytano ekranu „Brak połączenia”", ex);
            return null;
        }
    }
}
