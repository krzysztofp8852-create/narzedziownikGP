package pl.narzedziownikgp.app;

import android.Manifest;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Pobieranie plików z programu (#124): eksporty Excela, PDF z naklejkami, plakat budowy, dokumenty terminów
 * i uprawnień, zdjęcia. WebView sam niczego nie pobiera, a zewnętrzny Chrome nie ma sesji użytkownika.
 *
 * Plik spod adresu pobiera systemowy menedżer pobierania z ciasteczkami sesji WebView, więc serwer sprawdza dostęp jak
 * przy każdym zapytaniu programu: pliku, którego użytkownik nie może zobaczyć, menedżer nie zapisze. Plik z pamięci
 * strony (`blob:`, np. PDF z naklejkami, który powstaje przy druku) menedżer nie pobierze, więc strona czyta go i oddaje
 * skorupie metodą `saveFile`, a skorupa zapisuje go sama. Oba trafiają do „Pobranych” z powiadomieniem, a PDF
 * i obrazki od razu otwierają się w systemowej aplikacji.
 *
 * Wtyczka, a nie zwykła klasa, bo plik z pamięci przychodzi przez mostek Capacitora, który przyjmuje wywołania tylko
 * ze strony programu, a nie z ramek innych domen.
 */
@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    /** Kanał powiadomień o plikach zapisanych przez skorupę (z pamięci strony, Android 10+). */
    private static final String CHANNEL = "pobrane";
    private static final String NOTIFICATION_TAG = "pobrane";

    /**
     * Czyta plik z pamięci strony i oddaje go skorupie. Nazwę bierze z linku, który zaczął pobieranie, jeśli strona go
     * zostawiła: WebView nie podaje skorupie atrybutu `download`.
     */
    private static final String READ_PAGE_FILE = """
        (function (url, type) {
          var link = Array.prototype.find.call(document.querySelectorAll('a[download]'), function (a) { return a.href === url; });
          var fileName = link ? link.download : '';
          fetch(url)
            .then(function (response) { return response.blob(); })
            .then(function (blob) {
              return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve({ dataUrl: reader.result, type: blob.type }); };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsDataURL(blob);
              });
            })
            .then(function (file) {
              var data = file.dataUrl.slice(file.dataUrl.indexOf(',') + 1);
              return Capacitor.nativePromise('Downloads', 'saveFile', { data: data, mimeType: file.type || type, fileName: fileName });
            }, function (error) {
              console.error('Nie odczytano pliku do pobrania', error);
              return Capacitor.nativePromise('Downloads', 'saveFile', { mimeType: type, fileName: fileName });
            })
            .catch(function () {});
        })(%s, %s);
        """;

    private DownloadManager downloadManager;
    /** Pobrania zlecone menedżerowi, na których koniec czekamy: numer → nazwa i typ. */
    private final Map<Long, PendingDownload> pending = new HashMap<>();
    private ActivityResultLauncher<String> storagePermission;
    private Runnable waitingForPermission;

    private record PendingDownload(String fileName, String mimeType) {}

    private final BroadcastReceiver downloadCompleted = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            PendingDownload download = pending.remove(id);
            if (download == null) {
                return;
            }
            Integer status = status(id);
            if (status == null) {
                // Użytkownik anulował pobieranie w powiadomieniu.
                return;
            }
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                openOrAnnounce(downloadManager.getUriForDownloadedFile(id), download.mimeType(), download.fileName());
            } else {
                // Np. 404 albo 403: plik, którego użytkownik nie może zobaczyć, albo koniec sesji.
                toast(R.string.download_failed, download.fileName());
            }
        }
    };

    @Override
    public void load() {
        downloadManager = getContext().getSystemService(DownloadManager.class);
        // W onCreate aktywności (Capacitor ładuje wtyczki przy tworzeniu mostka), więc wolno zarejestrować wynik.
        storagePermission = getActivity().registerForActivityResult(new ActivityResultContracts.RequestPermission(), this::onStoragePermission);
        // Koniec pobierania ogłasza systemowy menedżer pobierania, czyli inna aplikacja.
        ContextCompat.registerReceiver(
            getContext(),
            downloadCompleted,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED
        );
        getBridge().getWebView().setDownloadListener(this::onDownloadStart);
    }

    @Override
    protected void handleOnDestroy() {
        getContext().unregisterReceiver(downloadCompleted);
    }

    private void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        Runnable download;
        if (url.startsWith("https://") || url.startsWith("http://")) {
            download = () -> enqueue(url, userAgent, contentDisposition, mimeType);
        } else if (url.startsWith("blob:") || url.startsWith("data:")) {
            download = () -> readPageFile(url, mimeType);
        } else {
            return;
        }
        // Przed Androidem 10 zapis do publicznych „Pobranych” wymaga zgody, od 10 nie.
        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            waitingForPermission = download;
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            return;
        }
        download.run();
    }

    private void onStoragePermission(boolean granted) {
        Runnable download = waitingForPermission;
        waitingForPermission = null;
        if (download == null) {
            return;
        }
        if (granted) {
            download.run();
        } else {
            toast(R.string.download_needs_storage);
        }
    }

    private void enqueue(String url, String userAgent, String contentDisposition, String rawMimeType) {
        String mimeType = DownloadFileName.mimeType(rawMimeType);
        String fileName = DownloadFileName.forUrl(url, contentDisposition, mimeType);
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimeType)
                .setTitle(fileName)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            // Sesja programu: bez niej serwer odesłałby menedżer do logowania.
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                request.allowScanningByMediaScanner();
            }
            pending.put(downloadManager.enqueue(request), new PendingDownload(fileName, mimeType));
            toast(R.string.download_started, fileName);
        } catch (RuntimeException ex) {
            // Np. brak pamięci zewnętrznej albo katalogu „Pobrane”.
            Logger.error("Nie zlecono pobierania " + url, ex);
            toast(R.string.download_failed, fileName);
        }
    }

    private void readPageFile(String url, String mimeType) {
        String script = String.format(READ_PAGE_FILE, JSONObject.quote(url), JSONObject.quote(mimeType == null ? "" : mimeType));
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    /** Plik z pamięci strony (`data` w base64) do „Pobranych”. Bez `data` strona nie zdołała go odczytać. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String mimeType = DownloadFileName.mimeType(call.getString("mimeType"));
        String fileName = DownloadFileName.forPageFile(call.getString("fileName"), mimeType);
        String data = call.getString("data");
        if (data == null) {
            toast(R.string.download_failed, fileName);
            call.reject("Brak pliku");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveToMediaStore(fileName, mimeType, bytes)
                : saveToPublicDownloads(fileName, mimeType, bytes);
            getActivity().runOnUiThread(() -> openOrAnnounce(uri, mimeType, fileName));
            call.resolve();
        } catch (IOException | RuntimeException ex) {
            Logger.error("Nie zapisano pliku " + fileName, ex);
            toast(R.string.download_failed, fileName);
            call.reject("Nie zapisano pliku", ex);
        }
    }

    /** Android 10+: „Pobrane” przez MediaStore, bez zgody na zapis. Powiadomienie daje skorupa. */
    private Uri saveToMediaStore(String fileName, String mimeType, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IOException("MediaStore nie założył pliku");
        }
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) {
                throw new IOException("MediaStore nie otworzył pliku");
            }
            out.write(bytes);
        } catch (IOException ex) {
            resolver.delete(uri, null, null);
            throw ex;
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        notifySaved(uri, mimeType, fileName);
        return uri;
    }

    /** Przed Androidem 10: plik w publicznych „Pobranych”, a menedżer pobierania dopisuje go do listy z powiadomieniem. */
    private Uri saveToPublicDownloads(String fileName, String mimeType, byte[] bytes) throws IOException {
        File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("Brak katalogu " + directory);
        }
        File file = uniqueFile(directory, fileName);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        long id = downloadManager.addCompletedDownload(file.getName(), file.getName(), true, mimeType, file.getAbsolutePath(), bytes.length, true);
        return downloadManager.getUriForDownloadedFile(id);
    }

    /** `naklejki.pdf`, a gdy już jest: `naklejki-1.pdf`, `naklejki-2.pdf`… */
    private static File uniqueFile(File directory, String fileName) {
        File file = new File(directory, fileName);
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String extension = dot > 0 ? fileName.substring(dot) : "";
        for (int i = 1; file.exists(); i++) {
            file = new File(directory, base + "-" + i + extension);
        }
        return file;
    }

    /** Stan pobierania w menedżerze; `null`, gdy go już nie ma (anulowane). */
    private Integer status(long id) {
        try (Cursor cursor = downloadManager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) {
                return null;
            }
            return cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        }
    }

    /**
     * PDF i obrazki otwierają się od razu w systemowej aplikacji, jak w Chrome. Inne pliki (Excel) i pobrania, które
     * skończyły się, gdy użytkownik był już gdzie indziej, czekają w „Pobranych” i w powiadomieniu.
     */
    private void openOrAnnounce(Uri uri, String mimeType, String fileName) {
        boolean viewable = mimeType.equals("application/pdf") || mimeType.startsWith("image/");
        boolean inFront = getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);
        if (uri != null && viewable && inFront) {
            try {
                getActivity().startActivity(viewIntent(uri, mimeType));
                return;
            } catch (ActivityNotFoundException ex) {
                Logger.debug("Brak aplikacji do otwarcia " + mimeType);
            }
        }
        toast(R.string.download_saved, fileName);
    }

    private static Intent viewIntent(Uri uri, String mimeType) {
        return new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mimeType).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }

    /**
     * Powiadomienie o pliku z pamięci strony, jakie przy pobieraniu spod adresu daje menedżer pobierania. Na Androidzie
     * 13+ bez zgody na powiadomienia go nie ma (o zgodę prosi przełącznik w dzwonku); plik i tak jest w „Pobranych”.
     */
    private void notifySaved(Uri uri, String mimeType, String fileName) {
        Context context = getContext();
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                context.getString(R.string.downloads_channel_name),
                NotificationManager.IMPORTANCE_LOW
            );
            manager.createNotificationChannel(channel);
        }
        Intent open = viewIntent(uri, mimeType).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent contentIntent = PendingIntent.getActivity(context, uri.hashCode(), open, PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setContentTitle(fileName)
            .setContentText(context.getString(R.string.download_complete))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .build();
        NotificationManagerCompat.from(context).notify(NOTIFICATION_TAG, uri.hashCode(), notification);
    }

    private void toast(int message, Object... args) {
        Context context = getContext();
        getActivity().runOnUiThread(() -> Toast.makeText(context, context.getString(message, args), Toast.LENGTH_SHORT).show());
    }
}
