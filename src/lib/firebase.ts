import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getFirestore,
  enableMultiTabIndexedDbPersistence,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { STORAGE_ENABLED } from './constants';

// ─── Firebase Config ──────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey:            import.meta.env['VITE_FIREBASE_API_KEY'] as string,
  authDomain:        import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'] as string,
  projectId:         import.meta.env['VITE_FIREBASE_PROJECT_ID'] as string,
  storageBucket:     import.meta.env['VITE_FIREBASE_STORAGE_BUCKET'] as string,
  messagingSenderId: import.meta.env['VITE_FIREBASE_MESSAGING_SENDER_ID'] as string,
  appId:             import.meta.env['VITE_FIREBASE_APP_ID'] as string,
  measurementId:     import.meta.env['VITE_FIREBASE_MEASUREMENT_ID'] as string,
};

// ─── App Init (singleton safe) ────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ─── App Check (reCAPTCHA v3) ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    if (import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true') {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}


// ─── Services ─────────────────────────────────────────────────────────────────
export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = STORAGE_ENABLED ? getStorage(app) : null;
export const functions = getFunctions(app, 'europe-west1');

// ─── Analytics (browser only) ─────────────────────────────────────────────────
export const analytics = isSupported().then((ok) => (ok ? getAnalytics(app) : null));

// ─── Offline Persistence ──────────────────────────────────────────────────────
// Enable multi-tab IndexedDB persistence for offline support
// (Attendance recording must work offline per spec)
enableMultiTabIndexedDbPersistence(db).catch((err: { code: string }) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — single-tab persistence
    console.warn('[DanceFlow] Firestore persistence: multiple tabs open, falling back.');
  } else if (err.code === 'unimplemented') {
    console.warn('[DanceFlow] Firestore persistence not supported in this browser.');
  }
});

// ─── Emulator Support (dev only) ──────────────────────────────────────────────
if (import.meta.env['VITE_USE_EMULATORS'] === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  if (STORAGE_ENABLED && storage) {
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
}

export default app;
