import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { firebaseConfig as cloudConfig } from '../firebase-config';

/** Con `npm run dev:local` todo va a los emuladores locales (proyecto "demo-…"), nunca a la nube. */
export const usingEmulators = import.meta.env.VITE_EMULATORS === '1';

const firebaseConfig = usingEmulators
  ? { ...cloudConfig, apiKey: 'demo-key', projectId: 'demo-villaflorencia', authDomain: 'demo-villaflorencia.firebaseapp.com' }
  : cloudConfig;

const EMULATOR_HOST = '127.0.0.1';

function connect(auth: Auth) {
  if (usingEmulators) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  return auth;
}

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth = connect(getAuth(app));
export const fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
if (usingEmulators) connectFirestoreEmulator(fs, EMULATOR_HOST, 8080);

// Segunda instancia solo para crear cuentas: así el administrador no pierde su sesión
// (createUserWithEmailAndPassword inicia sesión con la cuenta nueva en la instancia que lo llama).
let secondary: Auth | null = null;
export function creatorAuth(): Auth {
  if (!secondary) secondary = connect(getAuth(initializeApp(firebaseConfig, 'creator')));
  return secondary;
}
