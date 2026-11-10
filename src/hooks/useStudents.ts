import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  studentConverter,
  messageConverter,
  notificationConverter,
  COLLECTIONS,
  nowTimestamp,
  toTimestamp,
  removeUndefined,
} from '@/lib/converters';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import type { Student, StudentDocument, Message, Notification } from '@/types';
import toast from 'react-hot-toast';

export function useStudents() {
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const {
    students,
    setStudents,
    addStudent: storeAddStudent,
    updateStudent: storeUpdateStudent,
    removeStudent: storeRemoveStudent,
    setLoadingStudents,
  } = useSchoolStore();

  // ─── Real-time Subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || user?.role === 'parent') {
      return;
    }

    setLoadingStudents(true);

    const q = query(
      collection(db, COLLECTIONS.students(schoolId)).withConverter(studentConverter)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => d.data())
          .filter((s) => s.isDeleted !== true);
        // Sort by lastName, then firstName in memory for stability
        fetched.sort((a, b) => {
          const lastCompare = a.lastName.localeCompare(b.lastName, 'it');
          if (lastCompare !== 0) return lastCompare;
          return a.firstName.localeCompare(b.firstName, 'it');
        });
        setStudents(fetched);
        setLoadingStudents(false);
      },
      (error) => {
        console.error('[useStudents] onSnapshot error:', error);
        setLoadingStudents(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [schoolId, user?.role, setStudents, setLoadingStudents]);

  // ─── Fetch Students ─────────────────────────────────────────────────────────
  async function fetchStudents() {
    if (!schoolId) return;
    setLoadingStudents(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.students(schoolId)).withConverter(studentConverter)
      );
      const snap = await getDocs(q);
      const fetched = snap.docs
        .map((d) => d.data())
        .filter((s) => s.isDeleted !== true);
      // Sort by lastName, then firstName in memory for stability
      fetched.sort((a, b) => {
        const lastCompare = a.lastName.localeCompare(b.lastName, 'it');
        if (lastCompare !== 0) return lastCompare;
        return a.firstName.localeCompare(b.firstName, 'it');
      });
      setStudents(fetched);
    } catch (err) {
      console.error('[useStudents] fetch error:', err);
      toast.error('Impossibile caricare gli allievi.');
    } finally {
      setLoadingStudents(false);
    }
  }

  // ─── Create Student ──────────────────────────────────────────────────────────
  async function createStudent(data: Omit<Student, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    setLoading(true);
    try {
      const studentRef = doc(collection(db, COLLECTIONS.students(schoolId))).withConverter(studentConverter);
      const newStudent: Student = {
        ...data,
        id: studentRef.id,
        schoolId,
        isDeleted: false,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(studentRef, newStudent);

      // Sincronizzazione indice Codice Fiscale
      if (newStudent.fiscalCode) {
        const cleanCF = newStudent.fiscalCode.trim().toUpperCase();
        try {
          const cfRef = doc(db, 'schools', schoolId, 'fiscalCodesIndex', cleanCF);
          await setDoc(cfRef, {
            studentId: newStudent.id,
            firstName: newStudent.firstName,
            lastName: newStudent.lastName,
            studentName: `${newStudent.firstName} ${newStudent.lastName}`.trim(),
            status: 'registered',
            updatedAt: nowTimestamp(),
          }, { merge: true });
        } catch (cfErr) {
          console.warn('[useStudents] CF index operation skipped or restricted on create:', cfErr);
        }
      }

      storeAddStudent(newStudent);
      toast.success('Allievo registrato con successo!');
      return newStudent;
    } catch (err) {
      console.error('[useStudents] create error:', err);
      toast.error('Errore durante la registrazione dell\'allievo.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // ─── Edit Student ────────────────────────────────────────────────────────────
  async function editStudent(studentId: string, updates: Partial<Student>) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    setLoading(true);
    try {
      const ref = doc(db, COLLECTIONS.students(schoolId), studentId).withConverter(studentConverter);
      const finalUpdates = {
        ...updates,
        updatedAt: nowTimestamp(),
      };

      await updateDoc(ref, removeUndefined(finalUpdates));

      // Sincronizzazione variazione Codice Fiscale
      if (updates.fiscalCode !== undefined) {
        const cleanNewCF = updates.fiscalCode?.trim().toUpperCase();
        const currentStudent = students.find((s) => s.id === studentId);
        const oldCF = currentStudent?.fiscalCode?.trim().toUpperCase();

        // Evita re-indicizzazione se il CF non è cambiato
        if (cleanNewCF !== oldCF) {
          try {
            if (oldCF) {
              await deleteDoc(doc(db, 'schools', schoolId, 'fiscalCodesIndex', oldCF));
            }
            if (cleanNewCF) {
              const cfRef = doc(db, 'schools', schoolId, 'fiscalCodesIndex', cleanNewCF);
              await setDoc(cfRef, {
                studentId,
                firstName: updates.firstName || currentStudent?.firstName || '',
                lastName: updates.lastName || currentStudent?.lastName || '',
                studentName: `${updates.firstName || currentStudent?.firstName || ''} ${updates.lastName || currentStudent?.lastName || ''}`.trim(),
                status: 'registered',
                updatedAt: nowTimestamp(),
              }, { merge: true });
            }
          } catch (cfErr) {
            console.warn('[useStudents] CF index operation skipped or restricted on edit:', cfErr);
          }
        }
      }

      storeUpdateStudent(studentId, finalUpdates);
      toast.success('Dati allievo aggiornati!');
    } catch (err) {
      console.error('[useStudents] edit error:', err);
      const msg = (err as Error)?.message;
      toast.error(msg ? `Impossibile aggiornare i dati: ${msg}` : 'Impossibile aggiornare i dati.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // ─── Delete (Soft Delete) Student ──────────────────────────────────────────
  async function deleteStudent(studentId: string) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    setLoading(true);
    try {
      const ref = doc(db, COLLECTIONS.students(schoolId), studentId).withConverter(studentConverter);
      const updates = {
        isDeleted: true,
        deletedAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await updateDoc(ref, removeUndefined(updates));

      // Rimozione Codice Fiscale dall'indice
      const currentStudent = students.find((s) => s.id === studentId);
      if (currentStudent?.fiscalCode) {
        try {
          const oldCF = currentStudent.fiscalCode.trim().toUpperCase();
          await deleteDoc(doc(db, 'schools', schoolId, 'fiscalCodesIndex', oldCF));
        } catch (cfErr) {
          console.warn('[useStudents] CF index operation skipped or restricted on delete:', cfErr);
        }
      }

      storeRemoveStudent(studentId);
      toast.success('Allievo eliminato con successo.');
    } catch (err) {
      console.error('[useStudents] delete error:', err);
      toast.error('Impossibile eliminare l\'allievo.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // ─── Send Document Reminder (Sollecita) ──────────────────────────────────────
  async function sendDocumentReminder(student: Student) {
    if (!schoolId || !user) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const missingDocs: string[] = [];
      const docTypes = student.documents.map((d) => d.type);
      if (!docTypes.includes('consent')) missingDocs.push('Modulo di Iscrizione');
      if (!docTypes.includes('medical')) missingDocs.push('Certificato Medico');
      if (!docTypes.includes('identity')) missingDocs.push('Documento di Riconoscimento');

      if (missingDocs.length === 0) {
        toast.error('L\'allievo ha già caricato tutti i documenti!');
        return;
      }

      const parentName = student.contact.parentName || `${student.firstName} ${student.lastName}`;
      const parentEmail = student.contact.parentEmail || student.contact.studentEmail;

      if (!parentEmail) {
        toast.error('Nessun indirizzo email configurato per l\'allievo o il genitore.');
        return;
      }

      const recipientId = student.parentId || student.id;

      // 1. Create In-App Notification
      const notifRef = doc(collection(db, COLLECTIONS.notifications(recipientId))).withConverter(notificationConverter);
      const newNotif: Notification = {
        id: notifRef.id,
        userId: recipientId,
        schoolId,
        title: '⚠️ Documenti mancanti richiesti',
        body: `Gentile genitore/allievo, ti ricordiamo di caricare i seguenti documenti mancanti: ${missingDocs.join(', ')}.`,
        type: 'system',
        isRead: false,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };
      await setDoc(notifRef, newNotif);

      // 2. Create Email Message in schools/{schoolId}/messages
      const msgRef = doc(collection(db, COLLECTIONS.messages(schoolId))).withConverter(messageConverter);
      const newMsg: Message = {
        id: msgRef.id,
        schoolId,
        subject: `Tropical Style - Sollecitazione Documenti: ${student.firstName} ${student.lastName}`,
        body: `Gentile ${parentName},\n\nTi ricordiamo che per completare l'iscrizione a regola d'arte presso la nostra scuola di danza, mancano ancora i seguenti documenti:\n\n${missingDocs.map((d) => `- ${d}`).join('\n')}\n\nTi invitiamo ad accedere al tuo portale allievi per effettuare comodamente l'upload digitale in pochi passaggi.\n\nCordiali saluti,\nLa Direzione Tropical Style`,
        authorId: user.uid,
        recipientType: 'students',
        recipientIds: [student.id],
        channels: ['app', 'email'],
        status: 'sent',
        sentAt: nowTimestamp(),
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };
      await setDoc(msgRef, newMsg);

      toast.success(`Sollecito inviato con successo a ${parentName}!`);
    } catch (err) {
      console.error('[useStudents] sendDocumentReminder error:', err);
      toast.error('Impossibile inviare il sollecito.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Upload Student Document (Simulated / Real) ─────────────────────────────
  async function uploadStudentDocument(
    studentId: string,
    docType: 'identity' | 'medical' | 'consent' | 'insurance' | 'other',
    fileName: string,
    notes?: string,
    expiryDate?: Date,
    isValidated: boolean = false,
    fileDataUrl?: string
  ) {
    if (!schoolId) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const studentRef = doc(db, COLLECTIONS.students(schoolId), studentId).withConverter(studentConverter);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) throw new Error('Student not found');
      const student = studentSnap.data();

      // 1. Generate doc ID and set URL directly to fileDataUrl when provided
      const docId = doc(collection(db, 'placeholder')).id;
      const fileUrl = fileDataUrl || `https://example.com/mock-upload/schools/${schoolId}/students/${studentId}/${docType}/${docId}_${fileName}`;

      const newDoc: StudentDocument = {
        id: docId,
        name: fileName,
        type: docType,
        fileURL: fileUrl,
        uploadedAt: nowTimestamp(),
        notes: notes || undefined,
        isValidated,
      };

      // 2. Prepare updates (replace prior medical document to prevent unbounded Firestore size)
      let currentDocs = student.documents || [];
      if (docType === 'medical') {
        const existingIdx = currentDocs.findIndex((d) => d.type === 'medical');
        if (existingIdx >= 0) {
          currentDocs = [
            ...currentDocs.slice(0, existingIdx),
            newDoc,
            ...currentDocs.slice(existingIdx + 1),
          ];
        } else {
          currentDocs = [...currentDocs, newDoc];
        }
      } else {
        currentDocs = [...currentDocs, newDoc];
      }

      const updates: Partial<Student> = {
        documents: currentDocs,
        updatedAt: nowTimestamp(),
      };

      // If medical cert is uploaded, also update the medicalInfo fields
      if (docType === 'medical') {
        const medicalExpiry = expiryDate ? toTimestamp(expiryDate) : student.medicalInfo?.medicalClearanceExpiry;
        updates.medicalInfo = {
          ...student.medicalInfo,
          medicalClearance: isValidated,
          ...(medicalExpiry ? { medicalClearanceExpiry: medicalExpiry } : {}),
        };
      }

      // 3. Save to Firestore
      await updateDoc(studentRef, removeUndefined(updates));

      // 4. Update Zustand Store
      storeUpdateStudent(studentId, updates);

      toast.success('Documento caricato e registrato con successo!');
      return newDoc;
    } catch (err) {
      console.error('[useStudents] uploadStudentDocument error:', err);
      toast.error('Impossibile caricare il documento.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // ─── Approve Medical Certificate ───────────────────────────────────────────
  async function approveMedicalCertificate(
    studentId: string,
    docId?: string,
    expiryDate?: Date
  ) {
    if (!schoolId) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const studentRef = doc(db, COLLECTIONS.students(schoolId), studentId).withConverter(studentConverter);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) throw new Error('Student not found');
      const student = studentSnap.data();

      // 1. Mark medical document as validated
      const updatedDocs = (student.documents || []).map((d) => {
        if (docId ? d.id === docId : d.type === 'medical') {
          return { ...d, isValidated: true };
        }
        return d;
      });

      // 2. Prepare medicalInfo update
      const medicalExpiry = expiryDate
        ? toTimestamp(expiryDate)
        : student.medicalInfo?.medicalClearanceExpiry;

      const updates: Partial<Student> = {
        documents: updatedDocs,
        medicalInfo: {
          ...student.medicalInfo,
          medicalClearance: true,
          ...(medicalExpiry ? { medicalClearanceExpiry: medicalExpiry } : {}),
        },
        updatedAt: nowTimestamp(),
      };

      // 3. Save to Firestore
      await updateDoc(studentRef, removeUndefined(updates));

      // 4. Update Zustand Store
      storeUpdateStudent(studentId, updates);

      toast.success('Certificato medico approvato con successo!');
    } catch (err) {
      console.error('[useStudents] approveMedicalCertificate error:', err);
      toast.error('Impossibile approvare il certificato medico.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    students,
    loading,
    fetchStudents,
    createStudent,
    editStudent,
    deleteStudent,
    sendDocumentReminder,
    uploadStudentDocument,
    approveMedicalCertificate,
  };
}
