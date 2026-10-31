package com.schoolhub.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/**
 * Small encrypted key/value store for secrets such as saved logins.
 *
 * Values are encrypted with AES-256-GCM using a key generated inside the Android Keystore: the key
 * never leaves the secure hardware/OS keystore, so the stored text is useless if the app's files are
 * copied off the phone (backup, file access). Each value is bound to its own name (GCM associated
 * data), so ciphertext cannot be moved from one name to another.
 *
 * If the key is ever lost (for example after restoring a backup onto another phone) the value can no
 * longer be decrypted: it is deleted and reported as absent, and the user simply signs in again.
 */
@CapacitorPlugin(name = "SecureVault")
public class SecureVaultPlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "schoolhub_secure_vault_v1";
    private static final String PREFS = "schoolhub_secure_vault";
    private static final Pattern NAME_RE = Pattern.compile("^[a-z0-9._-]{1,64}$");
    private static final int MAX_VALUE_CHARS = 64 * 1024;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
            generator.init(
                new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            );
            generator.generateKey();
        }
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    private static String b64(byte[] data) {
        return Base64.encodeToString(data, Base64.NO_WRAP);
    }

    private String encrypt(String plain, String name) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return b64(cipher.getIV()) + ":" + b64(ciphertext);
    }

    private String decrypt(String stored, String name) throws Exception {
        String[] parts = stored.split(":");
        if (parts.length != 2) throw new IllegalStateException("Malformed value");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private static boolean validName(String key) {
        return key != null && NAME_RE.matcher(key).matches();
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (!validName(key)) {
            call.reject("Invalid key");
            return;
        }
        if (value == null || value.length() > MAX_VALUE_CHARS) {
            call.reject("Invalid value");
            return;
        }
        try {
            // commit() (not apply()) so the secret is on disk before the app can be killed.
            if (!prefs().edit().putString(key, encrypt(value, key)).commit()) {
                call.reject("Could not store value");
                return;
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not store value");
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (!validName(key)) {
            call.reject("Invalid key");
            return;
        }
        JSObject ret = new JSObject();
        String stored = prefs().getString(key, null);
        if (stored == null) {
            ret.put("value", JSONObject.NULL);
            call.resolve(ret);
            return;
        }
        try {
            ret.put("value", decrypt(stored, key));
        } catch (Exception e) {
            // Key lost or data damaged: it can never be read again, so discard it.
            prefs().edit().remove(key).commit();
            ret.put("value", JSONObject.NULL);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (!validName(key)) {
            call.reject("Invalid key");
            return;
        }
        prefs().edit().remove(key).commit();
        call.resolve();
    }
}
