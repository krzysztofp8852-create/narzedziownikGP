package pl.narzedziownikgp.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Systemowy „wstecz” cofa w historii programu, a na stronie startowej zamyka aplikację jak każdą inną.
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = bridge == null ? null : bridge.getWebView();
                        if (webView != null && webView.canGoBack() && !isStartPage(webView.getUrl())) {
                            webView.goBack();
                            return;
                        }
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                }
            );
    }

    @Override
    public void onPause() {
        super.onPause();
        // Sesja jest w ciasteczkach WebView; zapis na dysk, zanim system zamknie aplikację w tle.
        CookieManager.getInstance().flush();
    }

    /** Strona startowa to adres główny programu: tablica po zalogowaniu, strona o programie bez sesji. */
    private static boolean isStartPage(String url) {
        if (url == null) {
            return true;
        }
        String path = Uri.parse(url).getPath();
        return path == null || path.isEmpty() || path.equals("/");
    }
}
