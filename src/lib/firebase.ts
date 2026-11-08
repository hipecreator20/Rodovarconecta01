import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const legacyDisabledConfig = {
  projectId: firebaseAppletConfig?.projectId || 'demo-rodovar-conecta-disabled',
  apiKey: firebaseAppletConfig?.apiKey || 'disabled-local-placeholder',
  authDomain: firebaseAppletConfig?.authDomain || 'demo-rodovar-conecta-disabled.invalid',
  appId: firebaseAppletConfig?.appId,
  storageBucket: firebaseAppletConfig?.storageBucket,
  messagingSenderId: firebaseAppletConfig?.messagingSenderId,
};

const app = initializeApp(legacyDisabledConfig);

function initSafeFirestore() {
  try {
    return firebaseAppletConfig?.firestoreDatabaseId
      ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId)
      : getFirestore(app);
  } catch (err) {
    console.warn('Firestore initialization fallback:', err);
    return {} as ReturnType<typeof getFirestore>;
  }
}

function initSafeAuth() {
  try {
    return getAuth(app);
  } catch (err) {
    console.warn('Firebase Auth initialization fallback:', err);
    return { currentUser: null } as unknown as ReturnType<typeof getAuth>;
  }
}

export const db = initSafeFirestore();
export const auth = initSafeAuth();
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
// Cloud access is not used by the local session provider.

export {
  signInWithPopup,
  firebaseSignOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
};
export type { FirebaseUser };
