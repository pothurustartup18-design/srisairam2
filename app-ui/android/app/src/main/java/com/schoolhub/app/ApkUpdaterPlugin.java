package com.schoolhub.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Downloads, verifies and hands a native update APK to Android's package
 * installer. It never installs silently: the user always confirms in the
 * system UI, and Android itself refuses an APK whose signature differs from
 * the installed app. This plugin checks everything up-front so a bad APK is
 * rejected with a clear reason before the installer is ever shown:
 *   - HTTPS only (except debuggable builds), size-capped, app-private storage
 *   - SHA-256 equals the value in the signed release manifest
 *   - package name equals this app's
 *   - versionCode equals the manifest and is higher than the installed one
 *   - signing certificate(s) equal the installed app's (and the manifest's)
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String DIR_NAME = "apk-updates";
    private static final long MAX_APK_BYTES = 300L * 1024 * 1024;
    private static final int TIMEOUT_MS = 30000;

    private final AtomicBoolean downloading = new AtomicBoolean(false);

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), DIR_NAME);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    /** Plain-HTTP downloads are allowed only in debuggable or local-test builds (checksum + certificate checks still apply). */
    private boolean isDebuggable() {
        if ((getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) return true;
        try {
            ApplicationInfo ai = getContext().getPackageManager().getApplicationInfo(getContext().getPackageName(), PackageManager.GET_META_DATA);
            return ai.metaData != null && "true".equals(String.valueOf(ai.metaData.get("com.schoolhub.app.ALLOW_HTTP_UPDATES")));
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @PluginMethod
    public void getInstalledInfo(PluginCall call) {
        try {
            PackageInfo info = installedPackageInfo();
            JSObject ret = new JSObject();
            ret.put("packageName", info.packageName);
            ret.put("versionCode", PackageInfoCompat.getLongVersionCode(info));
            ret.put("versionName", info.versionName);
            ret.put("signingCertSha256", String.join(",", currentSignerDigests(info)));
            ret.put("canRequestPackageInstalls", canInstall());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read installed app info: " + e.getMessage(), "INFO_FAILED");
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String expectedSha = lower(call.getString("sha256"));
        final Long expectedVersionCode = call.getLong("versionCode");
        final String expectedCert = lower(call.getString("signingCertSha256"));
        if (url == null || expectedSha == null || !expectedSha.matches("[0-9a-f]{64}") || expectedVersionCode == null || expectedCert == null) {
            call.reject("url, sha256, versionCode and signingCertSha256 are required.", "BAD_ARGS");
            return;
        }
        if (!url.startsWith("https://") && !(isDebuggable() && url.startsWith("http://"))) {
            call.reject("Update downloads must use HTTPS.", "INSECURE_URL");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("A download is already in progress.", "BUSY");
            return;
        }

        new Thread(() -> {
            File tmp = new File(updatesDir(), "update-" + expectedVersionCode + ".apk.part");
            File apk = new File(updatesDir(), "update-" + expectedVersionCode + ".apk");
            try {
                cleanDir(null);
                String actualSha = fetch(url, tmp);
                if (!actualSha.equals(expectedSha)) {
                    throw new VerificationException("CHECKSUM_MISMATCH", "Downloaded APK checksum does not match the release manifest.");
                }
                if (!tmp.renameTo(apk)) throw new IOException("Could not finalize downloaded file.");

                notifyStage("verifying");
                PackageInfo archive = archivePackageInfo(apk);
                PackageInfo installed = installedPackageInfo();
                if (archive == null) {
                    throw new VerificationException("INVALID_APK", "Downloaded file is not a valid APK.");
                }
                if (!getContext().getPackageName().equals(archive.packageName)) {
                    throw new VerificationException("PACKAGE_MISMATCH", "APK is for a different app (" + archive.packageName + ").");
                }
                long archiveVc = PackageInfoCompat.getLongVersionCode(archive);
                long installedVc = PackageInfoCompat.getLongVersionCode(installed);
                if (archiveVc != expectedVersionCode) {
                    throw new VerificationException("VERSION_MISMATCH", "APK versionCode " + archiveVc + " does not match the release (" + expectedVersionCode + ").");
                }
                if (archiveVc <= installedVc) {
                    throw new VerificationException("DOWNGRADE", "APK is not newer than the installed app.");
                }
                Set<String> archiveCerts = currentSignerDigests(archive);
                Set<String> installedCerts = currentSignerDigests(installed);
                if (archiveCerts.isEmpty() || !archiveCerts.contains(expectedCert)) {
                    throw new VerificationException("SIGNATURE_MISMATCH", "APK is not signed with the expected release certificate.");
                }
                if (!archiveCerts.equals(installedCerts)) {
                    throw new VerificationException(
                        "SIGNATURE_MISMATCH",
                        "This installed app was signed with a different key, so Android cannot update it in place. Uninstall it and install the new APK once."
                    );
                }

                JSObject ret = new JSObject();
                ret.put("path", apk.getAbsolutePath());
                ret.put("sha256", actualSha);
                ret.put("versionCode", archiveVc);
                ret.put("versionName", archive.versionName);
                call.resolve(ret);
            } catch (VerificationException e) {
                deleteQuietly(tmp);
                deleteQuietly(apk);
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                deleteQuietly(tmp);
                deleteQuietly(apk);
                call.reject("Download failed: " + e.getMessage(), "DOWNLOAD_FAILED");
            } finally {
                downloading.set(false);
            }
        }).start();
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", canInstall());
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Opens the system installer for a previously downloaded and verified APK. */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        try {
            File apk = path == null ? null : new File(path).getCanonicalFile();
            if (apk == null || !apk.exists() || !apk.getParentFile().equals(updatesDir().getCanonicalFile()) || !apk.getName().endsWith(".apk")) {
                call.reject("No verified update APK at that path.", "NOT_FOUND");
                return;
            }
            if (!canInstall()) {
                call.reject("Allow this app to install updates, then try again.", "INSTALL_PERMISSION_REQUIRED");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the Android installer: " + e.getMessage(), "INSTALL_LAUNCH_FAILED");
        }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        cleanDir(call.getString("keepPath"));
        call.resolve();
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    private static class VerificationException extends Exception {
        final String code;

        VerificationException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private String fetch(String url, File dest) throws IOException, NoSuchAlgorithmException, VerificationException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setInstanceFollowRedirects(true);
        try {
            int status = conn.getResponseCode();
            if (status != 200) throw new IOException("HTTP " + status);
            if (!conn.getURL().getProtocol().equals("https") && !isDebuggable()) {
                throw new VerificationException("INSECURE_URL", "Update download was redirected to a non-HTTPS URL.");
            }
            long total = conn.getContentLengthLong();
            if (total > MAX_APK_BYTES) throw new VerificationException("TOO_LARGE", "Update APK is too large.");

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0;
            int lastPercent = -1;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    received += n;
                    if (received > MAX_APK_BYTES) throw new VerificationException("TOO_LARGE", "Update APK is too large.");
                    digest.update(buf, 0, n);
                    out.write(buf, 0, n);
                    int percent = total > 0 ? (int) (received * 100 / total) : -1;
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        progress.put("bytes", received);
                        progress.put("total", total);
                        notifyListeners("downloadProgress", progress);
                    }
                }
            }
            return hex(digest.digest());
        } finally {
            conn.disconnect();
        }
    }

    private void notifyStage(String stage) {
        JSObject data = new JSObject();
        data.put("stage", stage);
        notifyListeners("stage", data);
    }

    private PackageInfo installedPackageInfo() throws PackageManager.NameNotFoundException {
        PackageManager pm = getContext().getPackageManager();
        return pm.getPackageInfo(getContext().getPackageName(), signatureFlags());
    }

    private PackageInfo archivePackageInfo(File apk) {
        return getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), signatureFlags());
    }

    @SuppressWarnings("deprecation")
    private static int signatureFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    /** SHA-256 digests of the certificate(s) currently signing the package. */
    @SuppressWarnings("deprecation")
    private static Set<String> currentSignerDigests(PackageInfo info) throws NoSuchAlgorithmException {
        Set<String> out = new HashSet<>();
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            SigningInfo si = info.signingInfo;
            if (si.hasMultipleSigners()) {
                sigs = si.getApkContentsSigners();
            } else {
                Signature[] history = si.getSigningCertificateHistory();
                // History is ordered oldest -> current signer.
                if (history != null && history.length > 0) sigs = new Signature[] { history[history.length - 1] };
            }
        } else {
            sigs = info.signatures;
        }
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            out.add(hex(md.digest(s.toByteArray())));
        }
        return out;
    }

    private void cleanDir(String keepPath) {
        File[] files = updatesDir().listFiles();
        if (files == null) return;
        for (File f : files) {
            if (keepPath != null && f.getAbsolutePath().equals(keepPath)) continue;
            deleteQuietly(f);
        }
    }

    private static void deleteQuietly(File f) {
        if (f != null && f.exists()) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private static String lower(String s) {
        return s == null ? null : s.replace(":", "").toLowerCase(Locale.ROOT);
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }
}
