import { useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  createUserWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { userConverter, schoolConverter, COLLECTIONS, nowTimestamp, toTimestamp } from '@/lib/converters';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import type { AppUser, School } from '@/types';
import { slugify } from '@/lib/utils';

const googleProvider = new GoogleAuthProvider();

// ─── Bootstrap: sync Firebase Auth → Zustand ──────────────────────────────────
export function useAuthBootstrap() {
  const { setUser, setFirebaseUser, setLoading, setInitialized } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true);
      try {
        if (fbUser) {
          setFirebaseUser({ uid: fbUser.uid, email: fbUser.email });
          const appUser = await fetchOrCreateUser(fbUser);
          setUser(appUser);

          // Sync active school to schoolStore
          if (appUser.schoolId) {
            const schoolRef = doc(db, 'schools', appUser.schoolId).withConverter(schoolConverter);
            const schoolSnap = await getDoc(schoolRef);
            if (schoolSnap.exists()) {
              useSchoolStore.getState().setActiveSchool(schoolSnap.data());
            }
          } else {
            useSchoolStore.getState().setActiveSchool(null);
          }
        } else {
          setFirebaseUser(null);
          setUser(null);
          useSchoolStore.getState().setActiveSchool(null);
        }
      } catch (err) {
        console.error('[useAuthBootstrap] Auth sync error:', err);
        setFirebaseUser(null);
        setUser(null);
        useSchoolStore.getState().setActiveSchool(null);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    });
    return unsubscribe;
  }, []);
}

// ─── Fetch or create AppUser doc ──────────────────────────────────────────────
async function fetchOrCreateUser(fbUser: FirebaseUser): Promise<AppUser> {
  const ref = doc(db, COLLECTIONS.users, fbUser.uid).withConverter(userConverter);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data();
  }

  // First login — check if there is a pre-registered user with this email
  if (fbUser.email) {
    const q = query(
      collection(db, COLLECTIONS.users).withConverter(userConverter),
      where('email', '==', fbUser.email)
    );
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const preDoc = querySnap.docs[0];
      const preData = preDoc.data();

      const matchedUser: AppUser = {
        ...preData,
        id: fbUser.uid,
        uid: fbUser.uid,
        displayName: fbUser.displayName || preData.displayName || fbUser.email || 'Collaboratore',
        photoURL: fbUser.photoURL ?? undefined,
        isActive: true,
        updatedAt: nowTimestamp(),
      };

      // Rimuovi campi undefined
      const cleanMatched = Object.fromEntries(
        Object.entries(matchedUser).filter(([_, v]) => v !== undefined)
      ) as unknown as AppUser;

      await setDoc(ref, cleanMatched);

      // Delete the pre-registered document if its document ID is different from the UID
      if (preDoc.id !== fbUser.uid) {
        try {
          await deleteDoc(preDoc.ref);
        } catch (e) {
          console.error('[fetchOrCreateUser] Failed to delete pre-registered doc:', e);
        }
      }

      return cleanMatched;
    }
  }

  // First login (no match) — create user doc
  const newUser: AppUser = {
    id: fbUser.uid,
    uid: fbUser.uid,
    email: fbUser.email ?? '',
    displayName: fbUser.displayName ?? fbUser.email ?? 'Utente',
    photoURL: fbUser.photoURL ?? undefined,
    role: 'owner', // default role
    isActive: true,
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
  };

  // Rimuovi tutti i campi undefined prima di salvare su Firestore
  const cleanData = Object.fromEntries(
    Object.entries(newUser).filter(([_, v]) => v !== undefined)
  ) as unknown as AppUser;

  await setDoc(ref, cleanData);
  return newUser;
}

// ─── Auth Actions ─────────────────────────────────────────────────────────────
export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function logout() {
  await signOut(auth);
  useAuthStore.getState().reset();
}

export async function sendResetEmail(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export async function updateUserProfile(displayName: string, photoURL?: string) {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('Not authenticated');
  await updateProfile(fbUser, { displayName, photoURL: photoURL ?? null });

  const ref = doc(db, COLLECTIONS.users, fbUser.uid).withConverter(userConverter);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const updated: AppUser = { ...snap.data(), displayName, updatedAt: nowTimestamp() };
    await setDoc(ref, updated);
    useAuthStore.getState().setUser(updated);
  }
}

export async function registerSchoolAndAdmin(
  schoolName: string,
  referentName: string,
  email: string,
  password: string
) {
  // 1. Create auth user
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const fbUser = credential.user;

  // 2. Generate school document ID
  const schoolRef = doc(collection(db, 'schools')).withConverter(schoolConverter);
  const schoolId = schoolRef.id;

  // 3. Create the School document
  const thirtyDaysFromNow = toTimestamp(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  
  const newSchool: School = {
    id: schoolId,
    name: schoolName,
    slug: slugify(schoolName),
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    contact: {
      email: email,
    },
    subscription: {
      plan: 'trial',
      status: 'active',
      trialEndsAt: thirtyDaysFromNow,
    },
    settings: {
      currency: 'EUR',
      timezone: 'Europe/Rome',
      academicYearStart: 9, // September
      paymentDueDay: 10,
      allowParentPortal: true,
      notificationsEnabled: true,
      whatsappEnabled: false,
    },
    stats: {
      totalStudents: 0,
      activeStudents: 0,
      totalCourses: 0,
      monthlyRevenue: 0,
    },
  };

  await setDoc(schoolRef, newSchool);

  // 4. Create the AppUser document
  const userRef = doc(db, COLLECTIONS.users, fbUser.uid).withConverter(userConverter);
  const newUser: AppUser = {
    id: fbUser.uid,
    uid: fbUser.uid,
    email: email,
    displayName: referentName,
    role: 'admin', // registered user is the school admin
    schoolId: schoolId,
    isActive: true,
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
  };

  await setDoc(userRef, newUser);

  // 5. Update authStore
  useAuthStore.getState().setUser(newUser);
  useAuthStore.getState().setFirebaseUser({ uid: fbUser.uid, email: fbUser.email });
  
  return { user: newUser, school: newSchool };
}
