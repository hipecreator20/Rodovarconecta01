import { createRequire } from 'node:module';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

export const TEST_PROJECT = 'demo-rodovar-conecta';

export function assertEmulatorEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.RODOVAR_FIREBASE_ENV !== 'emulator' ||
    env.GCLOUD_PROJECT !== TEST_PROJECT ||
    env.NODE_ENV === 'production'
  ) {
    throw Error('Integração de testes bloqueada: ambiente emulador explícito obrigatório.');
  }
  if (
    env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
    env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
  ) {
    throw Error('Os emuladores devem usar apenas os endereços locais previstos.');
  }
  if (env.VERCEL || env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw Error('Credenciais de produção ou Vercel não são permitidas neste ambiente de testes.');
  }
}

export function firebaseTestRuntime(): { auth: Auth; db: Firestore } {
  assertEmulatorEnvironment();
  const req = createRequire(import.meta.url);
  const { initializeApp, getApps } = req('firebase-admin/app');
  const { getAuth } = req('firebase-admin/auth');
  const { getFirestore } = req('firebase-admin/firestore');
  const app =
    getApps().find((a: any) => a.name === TEST_PROJECT) ||
    initializeApp({ projectId: TEST_PROJECT }, TEST_PROJECT);
  return { auth: getAuth(app), db: getFirestore(app) };
}


