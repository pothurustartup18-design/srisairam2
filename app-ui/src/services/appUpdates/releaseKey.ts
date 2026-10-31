/**
 * Public half of the release-signing key (SPKI, base64 DER). Same key as
 * release/keys/release-signing-public.pem, which the native updater plugin
 * uses; this copy lets the app verify release manifests with WebCrypto.
 * Rotating the key requires a native release (see docs/APP_UPDATES.md).
 */
export const RELEASE_PUBLIC_KEY_SPKI_B64 =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAl4j8oGB8md4nVLxEX9NrFiAI4rhZnOtd3LeHtrj2UCYbcgukKmJN9d0QwSYyoKzUhAUvfgmYXpvdyRnH4ic69B8rVwedimNMj9SCo1c7a7RPlwf/2c8rJshDPfCPgPqq5cZ+A/BQO2qiSMYgGx06Wy6hFRTzy+gVdn3lT65YSLfXZssHH9AQxKUxj8yJO/9/mfMIXN+ZbzMzBnE93yL4C9h8gGwjm4T/e33HBFIk0nTnKCQbsipzcWtv66BrpXVTpJgWmAYQiOo/cdI5+wknsPXOO9jHRRuobXGqDsYh/VZSTb6fFdS4bXY24HswjzUf1ou2oL9NA4Y/v83XRhK7PQIDAQAB';

/** First 16 hex chars of SHA-256(SPKI DER); must match the manifest's keyId. */
export const RELEASE_KEY_ID = '7ec4427f4381580c';

/** SHA-256 of the APK signing certificate (from the release keystore). */
export const APK_SIGNING_CERT_SHA256 = '4f676eb2c29ee84a2fbd6c1764cf7919a84e62fbff5ed02a29cb3555d1942dae';

export const APP_PACKAGE_ID = 'com.schoolhub.app';
