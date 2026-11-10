import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, firebaseConfig } from '@/lib/firebase';
import {
  COLLECTIONS,
  studentConverter,
  paymentConverter,
  nowTimestamp,
} from '@/lib/converters';
import type { Student } from '@/types';

export interface PortalTargetContact {
  email: string;
  phone: string;
  recipientName: string;
  isMinor: boolean;
}

/**
 * Identifica il contatto primario di riferimento per l'invito al portale.
 * - Per i minorenni: dati genitore (con fallback sui contatti allievo se vuoti).
 * - Per i maggiorenni: dati allievo (con fallback sui contatti genitore se vuoti).
 */
export function resolvePortalTargetContact(student: Student, age: number): PortalTargetContact {
  const isMinor = age < 18;
  const contact = student.contact || {};

  const email = (isMinor
    ? (contact.parentEmail || contact.studentEmail || '')
    : (contact.studentEmail || contact.parentEmail || '')
  ).trim();

  const phone = (isMinor
    ? (contact.parentPhone || contact.studentPhone || '')
    : (contact.studentPhone || contact.parentPhone || '')
  ).trim();

  const recipientName = (isMinor
    ? (contact.parentName || `Genitore di ${student.firstName} ${student.lastName}`)
    : `${student.firstName} ${student.lastName}`
  ).trim();

  return {
    email,
    phone,
    recipientName,
    isMinor,
  };
}

/**
 * Costruisce il link di primo accesso per l'attivazione dell'account.
 */
export function buildPortalActivationUrl(email: string): string {
  const cleanEmail = email.trim().toLowerCase();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://danceflow-saas.web.app';
  return `${origin}/login?email=${encodeURIComponent(cleanEmail)}&firstAccess=true`;
}

/**
 * Invia l'email ufficiale di attivazione / reimpostazione password tramite Firebase Auth.
 */
export async function sendPortalPasswordResetEmail(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Indirizzo email non valido.');
  }
  await sendPasswordResetEmail(auth, cleanEmail);
}

export interface ProvisioningResult {
  parentUid: string;
  isNewAccount: boolean;
  linkedPaymentsCount: number;
  updatedContact: Student['contact'];
}

export interface ProvisionAndLinkParams {
  student: Student;
  schoolId: string;
  targetEmail: string;
  recipientName: string;
  phone?: string;
  isMinor?: boolean;
}

/**
 * Provisioning dell'account e collegamento Allievo + Ricevute:
 * 1. Verifica se l'utente esiste già in Firestore o Firebase Auth.
 * 2. Se non esiste, crea l'utenza tramite l'app secondaria PortalInviteAuth senza disconnettere la sessione segreteria.
 * 3. Assicura la presenza del documento in 'users/{parentUid}' con ruolo 'parent' e schoolId.
 * 4. Associa student.parentId = parentUid.
 * 5. Aggiorna e sincronizza permanentemente i contatti su student.contact in Firestore (email e telefono).
 * 6. Aggiorna (backfill) payment.parentId = parentUid per tutti i pagamenti esistenti dell'allievo.
 */
export async function provisionAndLinkPortalAccount({
  student,
  schoolId,
  targetEmail,
  recipientName,
  phone,
  isMinor,
}: ProvisionAndLinkParams): Promise<ProvisioningResult> {
  const cleanEmail = targetEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Inserisci un indirizzo email valido prima di procedere.');
  }

  let parentUid: string | null = null;
  let isNewAccount = false;

  // 1. Cerca se esiste già un utente in Firestore 'users' con questa email appartenente alla scuola
  try {
    const usersQuery = query(
      collection(db, COLLECTIONS.users),
      where('schoolId', '==', schoolId),
      where('email', '==', cleanEmail)
    );
    const usersSnap = await getDocs(usersQuery);

    if (!usersSnap.empty) {
      parentUid = usersSnap.docs[0].id;
    }
  } catch (usersErr) {
    console.warn('[portalInviteService] Error querying users collection:', usersErr);
  }

  // 2. Se l'allievo ha già un parentId registrato, verificalo
  if (!parentUid && student.parentId) {
    try {
      const existingRef = doc(db, COLLECTIONS.users, student.parentId);
      const existingSnap = await getDoc(existingRef);
      if (existingSnap.exists()) {
        parentUid = student.parentId;
      }
    } catch (docErr) {
      console.warn('[portalInviteService] Error fetching existing parent doc:', docErr);
    }
  }

  // 3. Se non trovato in Firestore 'users', crea in Firebase Auth via secondaria app
  if (!parentUid) {
    const inviteApp =
      getApps().find((a) => a.name === 'PortalInviteAuth') ||
      initializeApp(firebaseConfig, 'PortalInviteAuth');
    const inviteAuth = getAuth(inviteApp);

    try {
      const tempPassword = `DanceFlow_${Math.random().toString(36).substring(2, 10)}!${Date.now()}`;
      const cred = await createUserWithEmailAndPassword(inviteAuth, cleanEmail, tempPassword);
      parentUid = cred.user.uid;
      isNewAccount = true;
    } catch (authErr: unknown) {
      const errCode = (authErr as { code?: string })?.code;
      if (errCode === 'auth/email-already-in-use') {
        // L'email esiste già in Firebase Auth.
        // A. Cerca prima un utente esistente in Firestore 'users' con email e schoolId
        try {
          const uQ = query(
            collection(db, COLLECTIONS.users),
            where('schoolId', '==', schoolId),
            where('email', '==', cleanEmail)
          );
          const uSnap = await getDocs(uQ);
          if (!uSnap.empty) {
            parentUid = uSnap.docs[0].id;
          }
        } catch (uErr) {
          console.warn('[portalInviteService] Lookup users on email-already-in-use failed:', uErr);
        }

        // B. Se non trovato, cerca se altri allievi di questa scuola hanno già associato questo genitore
        if (!parentUid) {
          try {
            const otherStudentsQ = query(
              collection(db, COLLECTIONS.students(schoolId)),
              where('contact.parentEmail', '==', cleanEmail)
            );
            const otherSnap = await getDocs(otherStudentsQ);
            const found = otherSnap.docs.find((d) => d.data().parentId);
            if (found) {
              parentUid = found.data().parentId!;
            }
          } catch (stErr) {
            console.warn('[portalInviteService] Lookup other students failed:', stErr);
          }
        }

        // C. Se non presente in altri allievi, controlla se student.parentId è già valorizzato
        if (!parentUid && student.parentId) {
          parentUid = student.parentId;
        }

        // D. Se ancora non trovato, genera ID documento per la pre-registrazione deterministica
        if (!parentUid) {
          parentUid = doc(collection(db, COLLECTIONS.users)).id;
        }
      } else {
        throw authErr;
      }
    } finally {
      try {
        await signOut(inviteAuth);
      } catch (signOutErr) {
        console.warn('[portalInviteService] signOut inviteAuth error:', signOutErr);
      }
    }
  }

  const resolvedParentUid: string = parentUid || doc(collection(db, COLLECTIONS.users)).id;

  // 4. Salva o sincronizza il record in Firestore 'users/{parentUid}'
  const userRef = doc(db, COLLECTIONS.users, resolvedParentUid);
  await setDoc(
    userRef,
    {
      id: resolvedParentUid,
      uid: resolvedParentUid,
      email: cleanEmail,
      displayName: recipientName,
      role: 'parent',
      schoolId: schoolId,
      isActive: true,
      updatedAt: nowTimestamp(),
      createdAt: nowTimestamp(),
    },
    { merge: true }
  );

  // 5. Collega student.parentId = parentUid e sincronizza permanentemente i contatti su Firestore
  const studentRef = doc(db, COLLECTIONS.students(schoolId), student.id).withConverter(studentConverter);
  const currentContact = student.contact || {};
  const updatedContact = { ...currentContact };
  const cleanPhone = phone?.trim() || '';

  if (isMinor) {
    if (cleanEmail) updatedContact.parentEmail = cleanEmail;
    if (cleanPhone) updatedContact.parentPhone = cleanPhone;
    if (recipientName.trim()) updatedContact.parentName = recipientName.trim();
  } else {
    if (cleanEmail) updatedContact.studentEmail = cleanEmail;
    if (cleanPhone) updatedContact.studentPhone = cleanPhone;
  }

  await updateDoc(studentRef, {
    parentId: resolvedParentUid,
    contact: updatedContact,
    updatedAt: nowTimestamp(),
  });

  // 6. Backfill payment.parentId = parentUid per tutti i pagamenti dell'allievo (chunked per limite Firestore 500)
  let linkedPaymentsCount = 0;
  const pQuery = query(
    collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter),
    where('studentId', '==', student.id)
  );
  const pSnap = await getDocs(pQuery);

  if (!pSnap.empty) {
    const BATCH_SIZE = 400;
    const docsToUpdate = pSnap.docs.filter((d) => d.data().parentId !== resolvedParentUid);

    for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
      const chunk = docsToUpdate.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((docItem) => {
        batch.update(docItem.ref, {
          parentId: resolvedParentUid,
          updatedAt: nowTimestamp(),
        });
        linkedPaymentsCount++;
      });

      await batch.commit();
    }
  }

  return {
    parentUid: resolvedParentUid,
    isNewAccount,
    linkedPaymentsCount,
    updatedContact,
  };
}
