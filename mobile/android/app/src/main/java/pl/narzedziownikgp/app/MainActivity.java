package pl.narzedziownikgp.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginLoadException;
import com.getcapacitor.PluginManager;
import java.util.List;

public class MainActivity extends BridgeActivity {

    /** Kanał powiadomień FCM, ten sam co w `default_notification_channel_id` w manifeście. */
    private static final String NOTIFICATION_CHANNEL = "powiadomienia";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Przed pierwszym zdarzeniem strony startowej: Capacitor zaczął ją wczytywać w super.onCreate na tym samym wątku.
        OfflineWebViewClient webViewClient = new OfflineWebViewClient(bridge);
        bridge.setWebViewClient(webViewClient);
        createNotificationChannel();
        // Systemowy „wstecz” cofa w historii programu, a na stronie startowej i na ekranie „Brak połączenia” zamyka
        // aplikację jak każdą inną.
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = bridge == null ? null : bridge.getWebView();
                        boolean leave = webView == null || webViewClient.isOfflinePageShown() || isStartPage(webView.getUrl());
                        if (!leave && webView.canGoBack()) {
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

    /**
     * Bez projektu Firebase w buildzie (brak google-services.json) wtyczka push zamknęłaby aplikację przy włączaniu
     * powiadomień. Wtedy jej nie ładujemy, a strona widzi, że jej nie ma, i zostaje przy wersji webowej.
     */
    @Override
    protected void load() {
        if (getResources().getIdentifier("google_app_id", "string", getPackageName()) == 0) {
            try {
                List<Class<? extends Plugin>> plugins = new PluginManager(getAssets()).loadPluginClasses();
                plugins.remove(PushNotificationsPlugin.class);
                bridgeBuilder.setPlugins(plugins);
            } catch (PluginLoadException ex) {
                Logger.error("Error loading plugins.", ex);
            }
        }
        super.load();
    }

    /** Powiadomienia z dzwonka, zgłoszeń i czatu idą jednym kanałem, który użytkownik widzi w ustawieniach Androida. */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            NOTIFICATION_CHANNEL,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.notification_channel_description));
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
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
