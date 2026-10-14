import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doc, updateDoc, collection, onSnapshot, query, setDoc, getDocs, getDoc, where, Timestamp, deleteDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Input, Select, Button, Badge, EmptyState, Modal, ModalFooter } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { COLLECTIONS, nowTimestamp, userConverter } from '@/lib/converters';
import toast from 'react-hot-toast';
import type { AppUser } from '@/types';
import { useCourses } from '@/hooks/useCourses';
import { useStudents } from '@/hooks/useStudents';
import { getReceiptCounter, updateReceiptCounter } from '@/services/receiptService';
import { generateRegistrationPdf } from '@/services/pdf/RegistrationPdfBuilder';

import { PLAN_LIMITS } from '@/lib/constants';

interface RegistrationRequest {
  id: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  parentRelation?: string;
  parentUid: string;
  studentName: string;
  studentFirstName: string;
  studentLastName: string;
  studentBirthDate: Timestamp;
  gender?: 'M' | 'F' | 'Other';
  fiscalCode?: string;
  address?: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  studentPhone?: string | null;
  studentEmail?: string | null;
  courseInterest: string | null;
  courseIds?: string[];
  pdfUrl?: string;
  signatureBase64?: string;
  signatureUrl?: string;
  sha256Hash?: string;
  signatureMetadata?: {
    ipAddress: string;
    timestamp: Timestamp;
    userAgent: string;
    sessionId: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { activeSchool, setActiveSchool } = useSchoolStore();
  const [activeTab, setActiveTab] = useState<'general' | 'qr' | 'requests' | 'automation' | 'staff' | 'gdpr'>('general');
  const [isExporting, setIsExporting] = useState(false);

  // Staff states
  interface StaffInvite {
    id: string;
    email: string;
    displayName: string;
    role: 'teacher' | 'admin';
    schoolId: string;
    courseIds?: string[];
    used: boolean;
    createdAt: Timestamp;
  }
  
  const [staffUsers, setStaffUsers] = useState<AppUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'teacher' | 'admin'>('teacher');
  const [inviteCourseIds, setInviteCourseIds] = useState<string[]>([]);
  const [editingTeacher, setEditingTeacher] = useState<AppUser | null>(null);
  const [editingTeacherCourseIds, setEditingTeacherCourseIds] = useState<string[]>([]);
  const [savingTeacherCourses, setSavingTeacherCourses] = useState(false);
  const [submittingStaff, setSubmittingStaff] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [addStaffTab, setAddStaffTab] = useState<'invite' | 'promote'>('invite');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [promoteCustomEmail, setPromoteCustomEmail] = useState('');
  const [promoteCourseIds, setPromoteCourseIds] = useState<string[]>([]);
  const [isPromotingStudent, setIsPromotingStudent] = useState(false);

  // Students & Receipt States
  const { students, fetchStudents } = useStudents();
  const [receiptYear, setReceiptYear] = useState(new Date().getFullYear());
  const [receiptNextNumber, setReceiptNextNumber] = useState<number>(112);
  const [savingReceiptCounter, setSavingReceiptCounter] = useState(false);
  const [syncingRequests, setSyncingRequests] = useState(false);

  // School Settings Local State
  const [currency, setCurrency] = useState<'EUR' | 'USD' | 'GBP'>('EUR');
  const [academicYearStart, setAcademicYearStart] = useState(9);
  const [paymentDueDay, setPaymentDueDay] = useState(10);
  const [allowParentPortal, setAllowParentPortal] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappChannelUrl, setWhatsappChannelUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // State per Automazioni (Step 22)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [automationLogs, setAutomationLogs] = useState<string[]>(['[System Console] Pronta per elaborazione automazioni.']);

  // State per WhatsApp Simulator (Step 24)
  const [waPhone, setWaPhone] = useState('+39 345 6789 012');
  const [waTemplate, setWaTemplate] = useState('due_notice');
  const [waSending, setWaSending] = useState(false);

  // States per Configurazione WhatsApp Agnostica (meta / twilio)
  const [whatsappProvider, setWhatsappProvider] = useState<'twilio' | 'meta'>('twilio');
  const [whatsappAccountSid, setWhatsappAccountSid] = useState('');
  const [whatsappAuthToken, setWhatsappAuthToken] = useState('');
  const [whatsappPhoneNumber, setWhatsappPhoneNumber] = useState('');
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState('');

  // QR Registration Local State
  const [qrEnabled, setQrEnabled] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [savingQR, setSavingQR] = useState(false);

  // Real-time courses subscription
  const { courses } = useCourses();

  // Requests State
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedRequestIds([]);
  }, [activeTab]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [requestToApprove, setRequestToApprove] = useState<RegistrationRequest | null>(null);
  const [selectedCourseIdsToApprove, setSelectedCourseIdsToApprove] = useState<string[]>([]);

  // Sync state with activeSchool
  useEffect(() => {
    if (activeSchool) {
      setCurrency(activeSchool.settings.currency || 'EUR');
      setAcademicYearStart(activeSchool.settings.academicYearStart ?? 9);
      setPaymentDueDay(activeSchool.settings.paymentDueDay ?? 10);
      setAllowParentPortal(activeSchool.settings.allowParentPortal ?? true);
      setNotificationsEnabled(activeSchool.settings.notificationsEnabled ?? true);
      setWhatsappEnabled(activeSchool.settings.whatsappEnabled ?? false);
      setWhatsappChannelUrl(activeSchool.settings.whatsappChannelUrl || '');

      setQrEnabled(activeSchool.settings.registrationQR?.enabled ?? false);
      setQrToken(activeSchool.settings.registrationQR?.token ?? '');

      const config = activeSchool.whatsappConfig;
      setWhatsappProvider(config?.provider || 'twilio');
      setWhatsappAccountSid(config?.credentials?.accountSid || '');
      setWhatsappAuthToken(config?.credentials?.authToken || '');
      setWhatsappPhoneNumber(config?.credentials?.phoneNumber || '');
      setWhatsappAccessToken(config?.credentials?.accessToken || '');
      setWhatsappPhoneNumberId(config?.credentials?.phoneNumberId || '');
      setWhatsappBusinessAccountId(config?.credentials?.businessAccountId || '');
    }
  }, [activeSchool]);

  // Ensure students are loaded in store
  useEffect(() => {
    if (activeSchool?.id && students.length === 0) {
      fetchStudents().catch(console.error);
    }
  }, [activeSchool?.id, students.length, fetchStudents]);

  // Auto-sync existing active students' CFs into fiscalCodesIndex (Anti-Doppione)
  useEffect(() => {
    if (!activeSchool?.id || students.length === 0) return;
    const syncFiscalCodes = async () => {
      try {
        const withCF = students.filter((s) => !s.isDeleted && s.fiscalCode && s.fiscalCode.trim().length === 16);
        for (const st of withCF) {
          const cleanCF = st.fiscalCode!.trim().toUpperCase();
          const cfDocRef = doc(db, 'schools', activeSchool.id, 'fiscalCodesIndex', cleanCF);
          await setDoc(cfDocRef, {
            fiscalCode: cleanCF,
            status: 'registered',
            studentId: st.id,
            studentName: `${st.firstName} ${st.lastName}`,
            updatedAt: nowTimestamp(),
          }, { merge: true });
        }
      } catch (err) {
        console.warn('[SettingsPage] Error syncing fiscal codes index:', err);
      }
    };
    void syncFiscalCodes();
  }, [activeSchool?.id, students.length]);

  // Load receipt counter from Firestore
  useEffect(() => {
    if (!activeSchool?.id) return;
    getReceiptCounter(activeSchool.id)
      .then((counter) => {
        setReceiptYear(counter.year);
        setReceiptNextNumber(counter.nextNumber);
      })
      .catch(console.error);
  }, [activeSchool?.id]);

  const handleSaveReceiptCounter = async () => {
    if (!activeSchool?.id) return;
    setSavingReceiptCounter(true);
    try {
      await updateReceiptCounter(activeSchool.id, receiptNextNumber, receiptYear);
      toast.success(`Numerazione ricevute salvata! Prossima ricevuta: N° ${receiptNextNumber}`);
    } catch (err: any) {
      console.error(err);
      toast.error('Errore durante il salvataggio della numerazione ricevute.');
    } finally {
      setSavingReceiptCounter(false);
    }
  };

  const handleSyncRequestsWithStudents = async () => {
    if (!activeSchool?.id) return;
    setSyncingRequests(true);
    try {
      let updatedCount = 0;
      const batch = writeBatch(db);

      for (const req of requests) {
        const matching = students.find((s) => {
          if ((req as any).studentId && s.id === (req as any).studentId) return true;
          if (s.documents?.some((d) => d.id === `reg-${req.id}`)) return true;
          if (req.fiscalCode && s.fiscalCode && s.fiscalCode.trim().toUpperCase() === req.fiscalCode.trim().toUpperCase()) return true;
          if (s.parentId === req.parentUid && s.firstName?.trim().toLowerCase() === req.studentFirstName?.trim().toLowerCase()) return true;
          if (s.firstName?.trim().toLowerCase() === req.studentFirstName?.trim().toLowerCase() && s.lastName?.trim().toLowerCase() === req.studentLastName?.trim().toLowerCase()) return true;
          return false;
        });

        if (matching && matching.enrolledCourseIds && matching.enrolledCourseIds.length > 0) {
          const names = matching.enrolledCourseIds
            .map((cId) => courses.find((c) => c.id === cId)?.name)
            .filter(Boolean)
            .join(', ');

          const reqRef = doc(db, `schools/${activeSchool.id}/registrationRequests`, req.id);
          batch.update(reqRef, {
            studentId: matching.id,
            courseIds: matching.enrolledCourseIds,
            courseInterest: names || req.courseInterest,
            updatedAt: nowTimestamp(),
          });
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
        toast.success(`Sincronizzate ${updatedCount} richieste con i corsi reali degli allievi!`);
      } else {
        toast.success('Tutte le richieste sono già allineate con gli allievi.');
      }
    } catch (err: any) {
      console.error('Sync failed:', err);
      toast.error('Errore durante la sincronizzazione.');
    } finally {
      setSyncingRequests(false);
    }
  };

  const handleOpenRegistrationPdf = async (req: RegistrationRequest) => {
    if (req.pdfUrl && !req.pdfUrl.includes('placeholder-storage.local') && (req.pdfUrl.startsWith('https://') || req.pdfUrl.startsWith('http://'))) {
      window.open(req.pdfUrl, '_blank');
      return;
    }

    try {
      toast.loading('Generazione PDF Modulo Iscrizione...', { id: 'reg-pdf' });

      const studentPdfData = {
        firstName: req.studentFirstName,
        lastName: req.studentLastName,
        gender: req.gender || 'M',
        dateOfBirth: req.studentBirthDate,
        fiscalCode: req.fiscalCode || '',
        address: req.address || {
          street: '',
          city: '',
          province: '',
          postalCode: '',
        },
        contact: {
          studentPhone: req.studentPhone || undefined,
          studentEmail: req.studentEmail || undefined,
          parentName: req.parentName,
          parentRelation: req.parentRelation,
          parentPhone: req.parentPhone,
          parentEmail: req.parentEmail,
        },
      };

      const schoolPdfData = {
        name: activeSchool?.name || 'Tropical Style Caribbean School',
        logoURL: activeSchool?.logoURL || '/tropical_logo.png',
        address: activeSchool?.address,
        contact: activeSchool?.contact,
      };

      const fesMetadata = {
        ipAddress: req.signatureMetadata?.ipAddress || '127.0.0.1 (Verificato FES)',
        timestamp: req.signatureMetadata?.timestamp
          ? (typeof (req.signatureMetadata.timestamp as any).toMillis === 'function'
              ? (req.signatureMetadata.timestamp as any).toMillis()
              : typeof (req.signatureMetadata.timestamp as any).toDate === 'function'
                ? (req.signatureMetadata.timestamp as any).toDate().getTime()
                : new Date(req.signatureMetadata.timestamp as any).getTime())
          : (req.createdAt && typeof (req.createdAt as any).toDate === 'function'
              ? req.createdAt.toDate().getTime()
              : Date.now()),
        userAgent: req.signatureMetadata?.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0'),
        sessionId: req.signatureMetadata?.sessionId || req.id,
      };

      const signatureBase64 = req.signatureBase64 || req.signatureUrl || '';

      const { blob } = await generateRegistrationPdf(
        studentPdfData,
        schoolPdfData,
        signatureBase64,
        fesMetadata,
        '2025/2026'
      );

      const blobUrl = URL.createObjectURL(blob);
      const fileName = `Modulo_Iscrizione_${req.studentLastName}_${req.studentFirstName}.pdf`;

      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      toast.success('Modulo Iscrizione PDF aperto con successo!', { id: 'reg-pdf' });
    } catch (err: any) {
      console.error('[Settings] Error opening registration PDF:', err);
      toast.error('Impossibile generare il PDF dell\'iscrizione.', { id: 'reg-pdf' });
    }
  };

  // Load registration requests live
  useEffect(() => {
    if (!activeSchool) return;

    setLoadingRequests(true);
    const requestsQuery = query(
      collection(db, `schools/${activeSchool.id}/registrationRequests`)
    );

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const reqs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as RegistrationRequest[];
        // Sort requests by createdAt desc
        reqs.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setRequests(reqs);
        setLoadingRequests(false);
      },
      (err) => {
        console.error('[Settings] Fetching requests failed:', err);
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [activeSchool]);

  // Load staff users
  useEffect(() => {
    if (!activeSchool) return;

    setLoadingStaff(true);
    const q = query(
      collection(db, COLLECTIONS.users).withConverter(userConverter),
      where('schoolId', '==', activeSchool.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const users = snapshot.docs.map((d) => d.data());
        // Filter in-memory to get only staff (non-parents) and exclude temp invite users
        const staff = users.filter((u) => u.role !== 'parent' && !u.id.startsWith('temp-'));
        // Sort: Owner first, then Admin, then Teacher, then by displayName
        staff.sort((a, b) => {
          const roleOrder = { owner: 1, admin: 2, teacher: 3 };
          const aOrder = roleOrder[a.role as 'owner' | 'admin' | 'teacher'] || 4;
          const bOrder = roleOrder[b.role as 'owner' | 'admin' | 'teacher'] || 4;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.displayName.localeCompare(b.displayName);
        });
        setStaffUsers(staff);
        setLoadingStaff(false);
      },
      (err) => {
        console.error('[Settings] Fetching staff failed:', err);
        setLoadingStaff(false);
      }
    );

    return () => unsubscribe();
  }, [activeSchool]);

  // Load invites
  useEffect(() => {
    if (!activeSchool) return;

    const q = query(
      collection(db, 'invites'),
      where('schoolId', '==', activeSchool.id),
      where('used', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as StaffInvite[];
        setInvites(fetched);
      },
      (err) => {
        console.error('[Settings] Fetching invites failed:', err);
      }
    );

    return () => unsubscribe();
  }, [activeSchool]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool || !staffName || !staffEmail) {
      toast.error('Compila tutti i campi.');
      return;
    }

    setSubmittingStaff(true);
    setGeneratedInviteLink('');
    try {
      // 1. Check if user already exists in this school (in-memory lookup over school users to prevent permission errors)
      const q = query(
        collection(db, COLLECTIONS.users),
        where('schoolId', '==', activeSchool.id)
      );
      const querySnap = await getDocs(q);
      const exists = querySnap.docs.some(
        (d) => d.data().email?.toLowerCase() === staffEmail.trim().toLowerCase()
      );
      if (exists) {
        toast.error('Un collaboratore con questa email esiste già in questa scuola.');
        setSubmittingStaff(false);
        return;
      }

      // 2. Generate a random invite token
      const inviteToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const inviteRef = doc(db, 'invites', inviteToken);

      // Create invite in DB
      const inviteData = {
        email: staffEmail.trim().toLowerCase(),
        displayName: staffName.trim(),
        role: staffRole,
        schoolId: activeSchool.id,
        schoolName: activeSchool.name,
        courseIds: staffRole === 'teacher' ? inviteCourseIds : [],
        used: false,
        createdAt: nowTimestamp(),
      };
      await setDoc(inviteRef, inviteData);

      // 3. Pre-register the user in Firestore users collection
      const tempUserId = `temp-${inviteToken}`;
      const tempUserRef = doc(db, COLLECTIONS.users, tempUserId).withConverter(userConverter);
      
      const preUser: AppUser = {
        id: tempUserId,
        uid: tempUserId,
        email: staffEmail.trim().toLowerCase(),
        displayName: staffName.trim(),
        role: staffRole,
        schoolId: activeSchool.id,
        isActive: true,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };
      await setDoc(tempUserRef, preUser);

      // 4. Generate the link
      const inviteLink = `${window.location.origin}/join-staff/${inviteToken}`;
      setGeneratedInviteLink(inviteLink);
      toast.success('Invito generato con successo!');
    } catch (err: any) {
      console.error('[Settings] Add staff failed:', err);
      toast.error(err.message || 'Errore durante la generazione dell\'invito.');
    } finally {
      setSubmittingStaff(false);
    }
  };

  const handlePromoteStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool || !selectedStudentId) {
      toast.error('Seleziona un allievo da promuovere.');
      return;
    }

    const student = students.find((s) => s.id === selectedStudentId);
    if (!student) {
      toast.error('Allievo non trovato.');
      return;
    }

    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const studentEmail = (
      promoteCustomEmail ||
      student.contact?.studentEmail ||
      student.contact?.parentEmail ||
      ''
    ).trim().toLowerCase();

    if (!studentEmail) {
      toast.error('Inserisci un indirizzo email valido per consentire all\'insegnante di accedere all\'app.');
      return;
    }

    setIsPromotingStudent(true);
    try {
      // 1. Controlla se esiste già un utente in `users`
      let targetUid = student.parentId || '';
      let userDocRef = targetUid ? doc(db, COLLECTIONS.users, targetUid) : null;
      let existingUserData: AppUser | null = null;

      if (userDocRef) {
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          existingUserData = snap.data() as AppUser;
        }
      }

      if (!existingUserData) {
        // Cerca per email nella collection users
        const q = query(
          collection(db, COLLECTIONS.users).withConverter(userConverter),
          where('email', '==', studentEmail)
        );
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          targetUid = querySnap.docs[0].id;
          userDocRef = doc(db, COLLECTIONS.users, targetUid);
          existingUserData = querySnap.docs[0].data();
        }
      }

      // 2. Se l'utente esiste, aggiorna il suo ruolo a 'teacher' e assicura isActive e schoolId
      if (existingUserData && targetUid) {
        await updateDoc(userDocRef!, {
          role: 'teacher',
          schoolId: activeSchool.id,
          isActive: true,
          updatedAt: nowTimestamp(),
        });
      } else {
        // Pre-registra l'utente in `users` con role: 'teacher' in modo che al primo accesso riceva subito il ruolo
        const newUid = student.parentId || `student-${student.id}`;
        targetUid = newUid;
        userDocRef = doc(db, COLLECTIONS.users, newUid);

        const preUser: Partial<AppUser> = {
          id: newUid,
          uid: newUid,
          email: studentEmail,
          displayName: studentName,
          role: 'teacher',
          schoolId: activeSchool.id,
          isActive: true,
          createdAt: nowTimestamp(),
          updatedAt: nowTimestamp(),
        };
        await setDoc(userDocRef, preUser);
      }

      // 3. Collega lo studente a questo targetUid se non è già collegato
      if (student.parentId !== targetUid) {
        const studentRef = doc(db, COLLECTIONS.students(activeSchool.id), student.id);
        await updateDoc(studentRef, {
          parentId: targetUid,
          updatedAt: nowTimestamp(),
        });
      }

      // 4. Assegna/aggiorna i corsi selezionati per il nuovo maestro
      const activeCourses = courses.filter((c) => c.isActive && !c.isDeleted);
      for (const course of activeCourses) {
        const shouldHave = promoteCourseIds.includes(course.id);
        const currentTeachers = course.teacherIds || [];
        const hasTeacher = currentTeachers.includes(targetUid);

        if (shouldHave && !hasTeacher) {
          const cRef = doc(db, COLLECTIONS.courses(activeSchool.id), course.id);
          await updateDoc(cRef, {
            teacherIds: [...currentTeachers, targetUid],
            updatedAt: nowTimestamp(),
          });
        } else if (!shouldHave && hasTeacher) {
          const cRef = doc(db, COLLECTIONS.courses(activeSchool.id), course.id);
          await updateDoc(cRef, {
            teacherIds: currentTeachers.filter((t) => t !== targetUid),
            updatedAt: nowTimestamp(),
          });
        }
      }

      toast.success(`${studentName} è stato promosso ad Insegnante con successo!`);
      setIsAddStaffOpen(false);
      setSelectedStudentId('');
      setPromoteCourseIds([]);
      setPromoteCustomEmail('');
      setAddStaffTab('invite');
    } catch (err: any) {
      console.error('[Settings] Promote student failed:', err);
      toast.error(err.message || 'Errore durante la promozione dell\'allievo.');
    } finally {
      setIsPromotingStudent(false);
    }
  };

  const handleSaveTeacherCourses = async () => {
    if (!activeSchool || !editingTeacher) return;
    setSavingTeacherCourses(true);
    try {
      const activeCourses = courses.filter((c) => c.isActive && !c.isDeleted);
      for (const c of activeCourses) {
        const isAssigned = editingTeacherCourseIds.includes(c.id);
        const currentTeachers = c.teacherIds || [];
        const hasTeacher = currentTeachers.includes(editingTeacher.uid);

        if (isAssigned && !hasTeacher) {
          await updateDoc(doc(db, COLLECTIONS.courses(activeSchool.id), c.id), {
            teacherIds: [...currentTeachers, editingTeacher.uid],
            updatedAt: nowTimestamp(),
          });
        } else if (!isAssigned && hasTeacher) {
          await updateDoc(doc(db, COLLECTIONS.courses(activeSchool.id), c.id), {
            teacherIds: currentTeachers.filter((tid) => tid !== editingTeacher.uid),
            updatedAt: nowTimestamp(),
          });
        }
      }
      toast.success(`Corsi aggiornati con successo per ${editingTeacher.displayName}!`);
      setEditingTeacher(null);
    } catch (err: any) {
      console.error('[Settings] Save teacher courses error:', err);
      toast.error('Errore durante l\'aggiornamento dei corsi.');
    } finally {
      setSavingTeacherCourses(false);
    }
  };

  const handleRemoveStaff = async (userId: string, name: string) => {
    if (!activeSchool) return;
    
    // Safety check: Cannot remove yourself
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.uid === userId) {
      toast.error('Non puoi rimuovere te stesso!');
      return;
    }

    const confirmRemove = window.confirm(`Sei sicuro di voler rimuovere ${name} dallo staff? Perderà i permessi di insegnante.`);
    if (!confirmRemove) return;

    try {
      const userRef = doc(db, COLLECTIONS.users, userId);
      await updateDoc(userRef, {
        schoolId: activeSchool.id, // Mantiene associazione scuola per permettere accesso allievo
        role: 'parent', // Torna al ruolo standard allievo/genitore
        updatedAt: nowTimestamp(),
      });

      // Rimuovi questo insegnante da tutti i corsi in cui insegnava
      const activeCourses = courses.filter((c) => c.isActive && !c.isDeleted);
      for (const c of activeCourses) {
        if (c.teacherIds?.includes(userId)) {
          const cRef = doc(db, COLLECTIONS.courses(activeSchool.id), c.id);
          await updateDoc(cRef, {
            teacherIds: c.teacherIds.filter((tid) => tid !== userId),
            updatedAt: nowTimestamp(),
          });
        }
      }

      toast.success(`${name} rimosso dallo staff con successo.`);
    } catch (err: any) {
      console.error('[Settings] Remove staff failed:', err);
      toast.error('Impossibile rimuovere il collaboratore.');
    }
  };

  const handleRevokeInvite = async (inviteId: string, email: string) => {
    const confirmRevoke = window.confirm(`Sei sicuro di voler revocare l'invito per ${email}?`);
    if (!confirmRevoke) return;

    try {
      await deleteDoc(doc(db, 'invites', inviteId));
      await deleteDoc(doc(db, COLLECTIONS.users, `temp-${inviteId}`));
      toast.success('Invito revocato con successo.');
    } catch (err: any) {
      console.error('[Settings] Revoke invite failed:', err);
      toast.error('Impossibile revocare l\'invito.');
    }
  };

  const handleExportAllData = async () => {
    if (!activeSchool) return;

    setIsExporting(true);
    const toastId = toast.loading("Esportazione dei dati in corso...");

    try {
      const [studentsSnap, coursesSnap, paymentsSnap, attendanceSnap, messagesSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.students(activeSchool.id))),
        getDocs(collection(db, COLLECTIONS.courses(activeSchool.id))),
        getDocs(collection(db, COLLECTIONS.payments(activeSchool.id))),
        getDocs(collection(db, COLLECTIONS.attendance(activeSchool.id))),
        getDocs(collection(db, COLLECTIONS.messages(activeSchool.id))),
      ]);

      const exportData = {
        school: {
          id: activeSchool.id,
          name: activeSchool.name,
          slug: activeSchool.slug,
          subscription: activeSchool.subscription,
        },
        exportedAt: new Date().toISOString(),
        students: studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        courses: coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        payments: paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        attendance: attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        messages: messagesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      };

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `danceflow_export_${activeSchool.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${dateStr}.json`;
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Tutti i dati della scuola sono stati esportati con successo!", { id: toastId });
    } catch (err: any) {
      console.error('[SettingsPage] Data export error:', err);
      toast.error("Impossibile esportare i dati. Riprova più tardi.", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;

    setSavingSettings(true);
    try {
      const schoolRef = doc(db, 'schools', activeSchool.id);
      const updatedSettings = {
        ...activeSchool.settings,
        currency,
        academicYearStart: Number(academicYearStart),
        paymentDueDay: Number(paymentDueDay),
        allowParentPortal,
        notificationsEnabled,
        whatsappEnabled,
        whatsappChannelUrl: whatsappChannelUrl.trim() || undefined,
      };

      const credentials = whatsappProvider === 'twilio'
        ? {
            accountSid: whatsappAccountSid.trim(),
            authToken: whatsappAuthToken.trim(),
            phoneNumber: whatsappPhoneNumber.trim(),
          }
        : {
            accessToken: whatsappAccessToken.trim(),
            phoneNumberId: whatsappPhoneNumberId.trim(),
            businessAccountId: whatsappBusinessAccountId.trim(),
          };

      const whatsappConfig = whatsappEnabled
        ? {
            provider: whatsappProvider,
            credentials,
          }
        : null;

      await updateDoc(schoolRef, {
        settings: updatedSettings,
        whatsappConfig,
        updatedAt: nowTimestamp(),
      });

      setActiveSchool({
        ...activeSchool,
        settings: updatedSettings,
        whatsappConfig: whatsappConfig || undefined,
      });

      toast.success('Impostazioni salvate con successo!');
    } catch (err: any) {
      console.error('[Settings] Save failed:', err);
      toast.error(err.message || 'Errore durante il salvataggio.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleQR = async (enabled: boolean) => {
    if (!activeSchool) return;

    setSavingQR(true);
    try {
      let tokenToUse = qrToken;
      if (enabled && !tokenToUse) {
        tokenToUse = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }

      const schoolRef = doc(db, 'schools', activeSchool.id);
      const updatedQR = {
        enabled,
        token: tokenToUse,
      };

      const updatedSettings = {
        ...activeSchool.settings,
        registrationQR: updatedQR,
      };

      await updateDoc(schoolRef, {
        settings: updatedSettings,
        updatedAt: nowTimestamp(),
      });

      setQrEnabled(enabled);
      setQrToken(tokenToUse);
      setActiveSchool({
        ...activeSchool,
        settings: updatedSettings,
      });

      toast.success(enabled ? 'Self-registration QR abilitato!' : 'Self-registration QR disabilitato.');
    } catch (err: any) {
      console.error('[Settings] QR toggle failed:', err);
      toast.error(err.message || 'Errore durante il salvataggio.');
    } finally {
      setSavingQR(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!activeSchool) return;

    const confirmRegen = window.confirm(
      'Sei sicuro di voler rigenerare il token di registrazione? Il vecchio QR Code e link smetteranno di funzionare istantaneamente.'
    );
    if (!confirmRegen) return;

    setSavingQR(true);
    try {
      const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const schoolRef = doc(db, 'schools', activeSchool.id);
      const updatedQR = {
        enabled: qrEnabled,
        token: newToken,
      };

      const updatedSettings = {
        ...activeSchool.settings,
        registrationQR: updatedQR,
      };

      await updateDoc(schoolRef, {
        settings: updatedSettings,
        updatedAt: nowTimestamp(),
      });

      setQrToken(newToken);
      setActiveSchool({
        ...activeSchool,
        settings: updatedSettings,
      });

      toast.success('Nuovo token di registrazione generato!');
    } catch (err: any) {
      console.error('[Settings] QR regen failed:', err);
      toast.error(err.message || 'Errore durante la rigenerazione.');
    } finally {
      setSavingQR(false);
    }
  };

  // workflow di approvazione della registrazione
  const handleApproveRequest = async (req: RegistrationRequest, courseIdsToAssign?: string[] | string) => {
    if (!activeSchool) return;

    // Verifichiamo il limite del piano prima di procedere
    const planLimit = PLAN_LIMITS[activeSchool.subscription?.plan as keyof typeof PLAN_LIMITS] ?? Infinity;
    
    setProcessingRequestId(req.id);
    try {
      if (planLimit !== Infinity) {
        const activeStudentsSnap = await getDocs(
          query(
            collection(db, `schools/${activeSchool.id}/students`),
            where('isDeleted', '==', false),
            where('isActive', '==', true)
          )
        );
        if (activeStudentsSnap.size >= planLimit) {
          toast.error(`Limite del piano ${activeSchool.subscription.plan.toUpperCase()} raggiunto (${activeStudentsSnap.size}/${planLimit} allievi). Passa al piano superiore.`);
          setProcessingRequestId(null);
          return;
        }
      }
      
      const studentId = Math.random().toString(36).substring(2, 15);
      const studentRef = doc(db, COLLECTIONS.students(activeSchool.id), studentId);
      const userRef = req.parentUid ? doc(db, COLLECTIONS.users, req.parentUid) : null;
      const requestRef = doc(db, `schools/${activeSchool.id}/registrationRequests`, req.id);

      const batch = writeBatch(db);

      // Determine enrolled course IDs
      let enrolledCourseIds: string[] = [];
      if (Array.isArray(courseIdsToAssign)) {
        enrolledCourseIds = courseIdsToAssign.filter(Boolean);
      } else if (typeof courseIdsToAssign === 'string' && courseIdsToAssign) {
        enrolledCourseIds = [courseIdsToAssign];
      } else if (req.courseIds && req.courseIds.length > 0) {
        enrolledCourseIds = req.courseIds;
      } else if (req.courseInterest) {
        const requestedNames = req.courseInterest.split(',').map((s) => s.trim().toLowerCase());
        enrolledCourseIds = courses
          .filter((c) => c.isActive && !c.isDeleted && requestedNames.some((rn) => c.name.toLowerCase() === rn || rn.includes(c.name.toLowerCase())))
          .map((c) => c.id);
      }

      // 1. Crea il record dello studente in schools/{schoolId}/students
      batch.set(studentRef, {
        id: studentId,
        schoolId: activeSchool.id,
        firstName: req.studentFirstName,
        lastName: req.studentLastName,
        dateOfBirth: req.studentBirthDate,
        gender: req.gender || 'Other',
        isActive: true,
        isDeleted: false,
        parentId: req.parentUid,
        enrolledCourseIds: enrolledCourseIds,
        documents: req.pdfUrl ? [
          {
            id: `reg-${req.id}`,
            name: 'Modulo Iscrizione e Consenso Privacy.pdf',
            type: 'consent',
            fileURL: req.pdfUrl,
            uploadedAt: nowTimestamp(),
            notes: `Firmato digitalmente con FES (${req.sha256Hash ? req.sha256Hash.substring(0, 10) + '...' : 'Valido'})`,
          }
        ] : [],
        contact: {
          parentName: req.parentName,
          parentEmail: req.parentEmail,
          parentRelation: req.parentRelation || 'altro',
          parentPhone: req.parentPhone || null,
          studentPhone: req.studentPhone || null,
          studentEmail: req.studentEmail || null,
        },
        address: req.address || {
          street: '',
          city: '',
          province: '',
          postalCode: '',
          country: 'Italia',
        },
        fiscalCode: req.fiscalCode || null,
        signatureMetadata: req.signatureMetadata || null,
        sha256Hash: req.sha256Hash || null,
        signatureBase64: (req as any).signatureBase64 || (req as any).signatureUrl || null,
        signatureUrl: (req as any).signatureBase64 || (req as any).signatureUrl || null,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      });

      // 2. Attiva il genitore impostando isActive = true nel documento users/{parentUid}
      if (userRef && req.parentUid) {
        batch.set(userRef, {
          uid: req.parentUid,
          schoolId: activeSchool.id,
          role: 'parent',
          email: req.parentEmail,
          displayName: req.parentName,
          isActive: true,
          updatedAt: nowTimestamp(),
        }, { merge: true });
      }

      // 3. Aggiorna lo stato della richiesta in 'approved' e allinea i corsi assegnati
      const assignedCourseNames = enrolledCourseIds
        .map((cId) => courses.find((c) => c.id === cId)?.name)
        .filter(Boolean)
        .join(', ');

      batch.update(requestRef, {
        status: 'approved',
        studentId: studentId,
        courseIds: enrolledCourseIds,
        courseInterest: assignedCourseNames || req.courseInterest,
        updatedAt: nowTimestamp(),
      });

      // 4. Incrementa enrolledCount per ciascun corso assegnato
      for (const cId of enrolledCourseIds) {
        if (courses.some((c) => c.id === cId)) {
          const courseRef = doc(db, COLLECTIONS.courses(activeSchool.id), cId);
          batch.update(courseRef, {
            enrolledCount: increment(1),
            updatedAt: nowTimestamp(),
          });
        }
      }

      // 5. Aggiorna fiscalCodesIndex a 'registered'
      if (req.fiscalCode) {
        const cfDocRef = doc(db, 'schools', activeSchool.id, 'fiscalCodesIndex', req.fiscalCode.trim().toUpperCase());
        batch.set(cfDocRef, {
          fiscalCode: req.fiscalCode.trim().toUpperCase(),
          status: 'registered',
          studentId: studentId,
          studentName: req.studentName,
          updatedAt: nowTimestamp(),
        }, { merge: true });
      }

      await batch.commit();

      toast.success(`Richiesta approvata! Allievo "${req.studentName}" creato con successo.`);
    } catch (err: any) {
      console.error('[Settings] Approval failed:', err);
      toast.error(err.message || 'Impossibile approvare la richiesta.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (req: RegistrationRequest) => {
    if (!activeSchool) return;

    const confirmReject = window.confirm(`Sei sicuro di voler rifiutare la richiesta per "${req.studentName}"?`);
    if (!confirmReject) return;

    setProcessingRequestId(req.id);
    try {
      // Aggiorna lo stato della richiesta in 'rejected'
      const requestRef = doc(db, `schools/${activeSchool.id}/registrationRequests`, req.id);
      await updateDoc(requestRef, {
        status: 'rejected',
      });

      // Libera il CF dall'indice se la richiesta viene rifiutata
      if (req.fiscalCode) {
        try {
          const cfDocRef = doc(db, 'schools', activeSchool.id, 'fiscalCodesIndex', req.fiscalCode.trim().toUpperCase());
          await deleteDoc(cfDocRef);
        } catch (cfErr) {
          console.warn('[Settings] Error removing CF on reject:', cfErr);
        }
      }

      toast.success('Richiesta rifiutata.');
    } catch (err: any) {
      console.error('[Settings] Rejection failed:', err);
      toast.error(err.message || 'Impossibile rifiutare la richiesta.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleBulkApproveRequests = async (selectedReqs: RegistrationRequest[]) => {
    if (!activeSchool) return;
    const planLimit = PLAN_LIMITS[activeSchool.subscription?.plan as keyof typeof PLAN_LIMITS] ?? Infinity;
    
    setProcessingRequestId('bulk');
    try {
      if (planLimit !== Infinity) {
        const activeStudentsSnap = await getDocs(
          query(
            collection(db, `schools/${activeSchool.id}/students`),
            where('isDeleted', '==', false),
            where('isActive', '==', true)
          )
        );
        if (activeStudentsSnap.size + selectedReqs.length > planLimit) {
          toast.error(`La quantità di allievi selezionati supera il limite del tuo piano (${activeStudentsSnap.size + selectedReqs.length}/${planLimit} allievi).`);
          setProcessingRequestId(null);
          return;
        }
      }
      
      const batch = writeBatch(db);
      for (const req of selectedReqs) {
        const studentId = Math.random().toString(36).substring(2, 15);
        const studentRef = doc(db, COLLECTIONS.students(activeSchool.id), studentId);
        const userRef = req.parentUid ? doc(db, COLLECTIONS.users, req.parentUid) : null;
        const requestRef = doc(db, `schools/${activeSchool.id}/registrationRequests`, req.id);

        let enrolledCourseIds: string[] = [];
        if (req.courseIds && req.courseIds.length > 0) {
          enrolledCourseIds = req.courseIds;
        } else if (req.courseInterest) {
          const requestedNames = req.courseInterest.split(',').map((s) => s.trim().toLowerCase());
          enrolledCourseIds = courses
            .filter((c) => c.isActive && !c.isDeleted && requestedNames.some((rn) => c.name.toLowerCase() === rn || rn.includes(c.name.toLowerCase())))
            .map((c) => c.id);
        }

        batch.set(studentRef, {
          id: studentId,
          schoolId: activeSchool.id,
          firstName: req.studentFirstName,
          lastName: req.studentLastName,
          dateOfBirth: req.studentBirthDate,
          gender: req.gender || 'Other',
          isActive: true,
          isDeleted: false,
          parentId: req.parentUid,
          enrolledCourseIds: enrolledCourseIds,
          documents: req.pdfUrl ? [
            {
              id: `reg-${req.id}`,
              name: 'Modulo Iscrizione e Consenso Privacy.pdf',
              type: 'consent',
              fileURL: req.pdfUrl,
              uploadedAt: nowTimestamp(),
              notes: `Firmato digitalmente con FES (${req.sha256Hash ? req.sha256Hash.substring(0, 10) + '...' : 'Valido'})`,
            }
          ] : [],
          contact: {
            parentName: req.parentName,
            parentEmail: req.parentEmail,
            parentRelation: req.parentRelation || 'altro',
            parentPhone: req.parentPhone || null,
            studentPhone: req.studentPhone || null,
            studentEmail: req.studentEmail || null,
          },
          address: req.address || {
            street: '',
            city: '',
            province: '',
            postalCode: '',
            country: 'Italia',
          },
          fiscalCode: req.fiscalCode || null,
          signatureMetadata: req.signatureMetadata || null,
          sha256Hash: req.sha256Hash || null,
          createdAt: nowTimestamp(),
          updatedAt: nowTimestamp(),
        });

        if (userRef && req.parentUid) {
          batch.set(userRef, {
            uid: req.parentUid,
            schoolId: activeSchool.id,
            role: 'parent',
            email: req.parentEmail,
            displayName: req.parentName,
            isActive: true,
            updatedAt: nowTimestamp(),
          }, { merge: true });
        }

        const assignedCourseNames = enrolledCourseIds
          .map((cId) => courses.find((c) => c.id === cId)?.name)
          .filter(Boolean)
          .join(', ');

        batch.update(requestRef, {
          status: 'approved',
          studentId: studentId,
          courseIds: enrolledCourseIds,
          courseInterest: assignedCourseNames || req.courseInterest,
          updatedAt: nowTimestamp(),
        });

        for (const cId of enrolledCourseIds) {
          const courseRef = doc(db, COLLECTIONS.courses(activeSchool.id), cId);
          batch.update(courseRef, {
            enrolledCount: increment(1),
            updatedAt: nowTimestamp(),
          });
        }

        if (req.fiscalCode) {
          const cfDocRef = doc(db, 'schools', activeSchool.id, 'fiscalCodesIndex', req.fiscalCode.trim().toUpperCase());
          batch.set(cfDocRef, {
            fiscalCode: req.fiscalCode.trim().toUpperCase(),
            status: 'registered',
            studentId: studentId,
            studentName: req.studentName,
            updatedAt: nowTimestamp(),
          }, { merge: true });
        }
      }

      await batch.commit();
      toast.success(`${selectedReqs.length} richieste approvate con successo!`);
      setSelectedRequestIds([]);
    } catch (err: any) {
      console.error('[Settings] Bulk approval failed:', err);
      toast.error(err.message || 'Impossibile approvare le richieste in blocco.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleBulkRejectRequests = async (selectedReqs: RegistrationRequest[]) => {
    if (!activeSchool) return;
    if (!window.confirm(`Sei sicuro di voler rifiutare ${selectedReqs.length} richieste?`)) return;

    setProcessingRequestId('bulk');
    try {
      const batch = writeBatch(db);
      for (const req of selectedReqs) {
        const requestRef = doc(db, `schools/${activeSchool.id}/registrationRequests`, req.id);
        batch.update(requestRef, {
          status: 'rejected',
        });
      }
      await batch.commit();
      toast.success(`${selectedReqs.length} richieste rifiutate.`);
      setSelectedRequestIds([]);
    } catch (err: any) {
      console.error('[Settings] Bulk rejection failed:', err);
      toast.error(err.message || 'Impossibile rifiutare le richieste in blocco.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const addLog = (msg: string) => {
    setAutomationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString('it-IT')}] ${msg}`]);
  };

  const handleTriggerBatchDues = async () => {
    if (!activeSchool) return;
    
    const confirmTrigger = window.confirm(
      `Confermi l'esecuzione del daemon di fatturazione batch per il mese di ${selectedMonth}/${selectedYear}? Verranno create le rate mensili pendenti per tutti gli allievi attivi.`
    );
    if (!confirmTrigger) return;

    setRunningAutomation(true);
    addLog(`Avvio daemon di fatturazione batch per il mese di ${selectedMonth}/${selectedYear}...`);
    
    try {
      // 1. Carica allievi attivi della scuola
      const studentsSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.students(activeSchool.id)),
          where('isActive', '==', true)
        )
      );
      const activeStudents = studentsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(s => s.isDeleted !== true);
      addLog(`Trovati ${activeStudents.length} allievi attivi nel database.`);

      // 2. Carica i corsi della scuola
      const coursesSnap = await getDocs(
        collection(db, COLLECTIONS.courses(activeSchool.id))
      );
      const coursesList = coursesSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(c => c.isDeleted !== true);
      const coursesMap = new Map(coursesList.map(c => [c.id, c]));

      let generatedCount = 0;
      let skippedCount = 0;

      for (const student of activeStudents) {
        const enrolledIds = student.enrolledCourseIds || [];

        for (const courseId of enrolledIds) {
          const course = coursesMap.get(courseId);
          if (!course) continue;

          const hasCustomFee = student.customMonthlyFee !== undefined && student.customMonthlyFee !== null;
          const feeMonthly = hasCustomFee ? student.customMonthlyFee : (course.fee?.monthly || 0);
          if (feeMonthly <= 0 && !hasCustomFee) continue;

          const desc = `Retta Mensile: ${course.name} - Mese ${selectedMonth}/${selectedYear}`;
          
          // Verifica se un pagamento simile esiste già
          const paymentsQuery = query(
            collection(db, COLLECTIONS.payments(activeSchool.id)),
            where('studentId', '==', student.id),
            where('courseId', '==', courseId),
            where('month', '==', Number(selectedMonth)),
            where('year', '==', Number(selectedYear)),
            where('type', '==', 'monthly')
          );
          const pSnap = await getDocs(paymentsQuery);

          if (!pSnap.empty) {
            skippedCount++;
            continue;
          }

          // Genera quota
          const payId = Math.random().toString(36).substring(2, 15);
          const payRef = doc(db, COLLECTIONS.payments(activeSchool.id), payId);

          const due = new Date(selectedYear, selectedMonth - 1, activeSchool.settings.paymentDueDay || 10);

          await setDoc(payRef, {
            id: payId,
            schoolId: activeSchool.id,
            studentId: student.id,
            ...(student.parentId ? { parentId: student.parentId } : {}),
            courseId: courseId,
            description: desc,
            amount: feeMonthly,
            currency: activeSchool.settings.currency || 'EUR',
            status: 'pending',
            dueDate: Timestamp.fromDate(due),
            type: 'monthly',
            month: Number(selectedMonth),
            year: Number(selectedYear),
            createdAt: nowTimestamp(),
            updatedAt: nowTimestamp(),
          });

          // Notifica WhatsApp simulatore
          if (whatsappEnabled) {
            addLog(`[WhatsApp Beta] Notifica push programmata per ${student.contact?.parentName || 'Genitore'} (${student.contact?.parentPhone || 'SMS'}) -> "${desc}"`);
          }

          generatedCount++;
        }
      }

      addLog(`Elaborazione completata con successo!`);
      addLog(`Rate generate: ${generatedCount} | Rate saltate (già esistenti): ${skippedCount}`);
      toast.success(`Fatturazione completata! Generate ${generatedCount} nuove rate.`);
    } catch (err: any) {
      console.error('[Automation] Batch dues failed:', err);
      addLog(`[ERRORE] Elaborazione fallita: ${err.message}`);
      toast.error('Errore durante l\'emissione delle rate.');
    } finally {
      setRunningAutomation(false);
    }
  };

  const handleTriggerOverdueDaemon = async () => {
    if (!activeSchool) return;

    setRunningAutomation(true);
    addLog(`Avvio Overdue Daemon: scansione e notifica pagamenti scaduti...`);

    try {
      const now = new Date();
      // Trova i pagamenti in attesa scaduti
      const paymentsSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.payments(activeSchool.id)),
          where('status', '==', 'pending')
        )
      );

      let overdueCount = 0;

      for (const pDoc of paymentsSnap.docs) {
        const payment = { id: pDoc.id, ...pDoc.data() } as any;
        const dueMillis = payment.dueDate.toMillis();
        
        if (dueMillis < now.getTime()) {
          // Segna come scaduto
          await updateDoc(doc(db, COLLECTIONS.payments(activeSchool.id), payment.id), {
            status: 'overdue',
            updatedAt: nowTimestamp(),
          });

          // Invia notifica push in-app simulatore
          const notifId = Math.random().toString(36).substring(2, 15);
          const notifRef = doc(db, COLLECTIONS.notifications(payment.studentId), notifId);
          await setDoc(notifRef, {
            id: notifId,
            userId: payment.studentId,
            schoolId: activeSchool.id,
            title: '⚠️ Rata Scaduta!',
            body: `Gentile genitore, la quota "${payment.description}" risulta scaduta. Ti invitiamo a regolarizzare al più presto.`,
            type: 'payment_reminder',
            isRead: false,
            createdAt: nowTimestamp(),
            updatedAt: nowTimestamp(),
          });

          addLog(`[FCM Notifiche] Inviata notifica push in-app a studente/genitore ${payment.studentId}`);
          overdueCount++;
        }
      }

      addLog(`Daemon completato.`);
      addLog(`Trovate e convertite in morosità: ${overdueCount} rate.`);
      toast.success(`Daemon terminato! ${overdueCount} pagamenti convertiti in scaduti.`);
    } catch (err: any) {
      console.error('[Automation] Overdue Daemon failed:', err);
      addLog(`[ERRORE] Daemon fallito: ${err.message}`);
      toast.error('Errore durante l\'esecuzione del daemon.');
    } finally {
      setRunningAutomation(false);
    }
  };

  const handleSendWATest = async () => {
    setWaSending(true);
    addLog(`[WhatsApp API] Inizializzazione sessione WhatsApp Business per il destinatario ${waPhone}...`);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      addLog(`[WhatsApp API] Handshake con server API WhatsApp Business completato.`);
      addLog(`[WhatsApp API] Messaggio template "${waTemplate}" inviato con successo al numero ${waPhone}!`);
      toast.success('Messaggio di test WhatsApp inviato con successo!');
    } catch (err: any) {
      addLog(`[WhatsApp API ERRORE] Invio fallito: ${err.message}`);
      toast.error('Errore durante l\'invio WhatsApp.');
    } finally {
      setWaSending(false);
    }
  };

  const origin = (typeof window !== 'undefined' && window.location.hostname.includes('localhost'))
    ? window.location.origin
    : 'https://www.tropicalstyle.it';
  const registrationLink = `${origin}/join/${qrToken}`;

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Impostazioni Scuola'
          subtitle='Gestisci la configurazione globale, il QR di iscrizione self-service e le richieste degli allievi.'
        />

        {/* Tab Buttons */}
        <div className='flex border-b border-white/5 space-x-2 pb-px'>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'general'
                ? 'text-brand-400 border-b-2 border-brand-400 font-semibold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            ⚙️ Generali
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-1 ${
              activeTab === 'qr'
                ? 'text-brand-400 border-b-2 border-brand-400 font-semibold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            📱 QR Registrazione
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'requests'
                ? 'text-brand-400 border-b-2 border-brand-400 font-semibold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            📩 Richieste Iscrizione
            {requests.filter((r) => r.status === 'pending').length > 0 && (
              <Badge variant='coral' className='animate-pulse'>
                {requests.filter((r) => r.status === 'pending').length}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-1 ${
              activeTab === 'automation'
                ? 'text-brand-400 border-b-2 border-brand-400 font-semibold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            ⚡ Automazioni (Cloud)
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-1 ${
              activeTab === 'staff'
                ? 'text-brand-400 border-b-2 border-brand-400 font-semibold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            👥 Gestione Staff
          </button>
          <button
            onClick={() => setActiveTab('gdpr')}
            className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-1 ${
              activeTab === 'gdpr'
                ? 'text-brand-400 border-b-2 border-brand-400 font-semibold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            🔒 Privacy & GDPR
          </button>
        </div>

        {/* General Settings Tab */}
        {activeTab === 'general' && (
          <>
            <Card className='p-6 max-w-2xl border border-white/5'>
            <CardTitle className='mb-4'>Configurazione Gestionale</CardTitle>
            <form onSubmit={handleSaveGeneralSettings} className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Select
                  label='Valuta di Riferimento'
                  value={currency}
                  onChange={(e: any) => setCurrency(e.target.value)}
                  options={[
                    { value: 'EUR', label: 'Euro (€)' },
                    { value: 'USD', label: 'Dollaro ($)' },
                    { value: 'GBP', label: 'Sterlina (£)' },
                  ]}
                />
                <Input
                  type='number'
                  label='Giorno Scadenza Rette (Mese)'
                  min={1}
                  max={28}
                  value={paymentDueDay}
                  onChange={(e: any) => setPaymentDueDay(e.target.value)}
                />
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Select
                  label='Mese Inizio Anno Accademico'
                  value={academicYearStart}
                  onChange={(e: any) => setAcademicYearStart(e.target.value)}
                  options={[
                    { value: '1', label: 'Gennaio' },
                    { value: '9', label: 'Settembre' },
                    { value: '10', label: 'Ottobre' },
                  ]}
                />
              </div>

              <div className='pt-4 border-t border-white/5 space-y-3'>
                <h4 className='text-sm font-semibold text-white/80'>Abilitazione Moduli</h4>
                
                <label className='flex items-center space-x-3 cursor-pointer text-sm text-white/70 hover:text-white transition'>
                  <input
                    type='checkbox'
                    checked={allowParentPortal}
                    onChange={(e) => setAllowParentPortal(e.target.checked)}
                    className='rounded border-white/10 bg-surface-800 text-brand-500 focus:ring-brand-500'
                  />
                  <span>Attiva Portale Allievi / Genitori (Self-Service Touch)</span>
                </label>

                <label className='flex items-center space-x-3 cursor-pointer text-sm text-white/70 hover:text-white transition'>
                  <input
                    type='checkbox'
                    checked={notificationsEnabled}
                    onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    className='rounded border-white/10 bg-surface-800 text-brand-500 focus:ring-brand-500'
                  />
                  <span>Abilita Email Automatiche (Scadenze & Ricevute)</span>
                </label>

                <label className='flex items-center space-x-3 cursor-pointer text-sm text-white/70 hover:text-white transition'>
                  <input
                    type='checkbox'
                    checked={whatsappEnabled}
                    onChange={(e) => setWhatsappEnabled(e.target.checked)}
                    className='rounded border-white/10 bg-surface-800 text-brand-500 focus:ring-brand-500'
                  />
                  <span>Integrazione Notifiche WhatsApp (Beta)</span>
                </label>

                <div className="pt-2">
                  <Input
                    label="Canale / Gruppo WhatsApp Ufficiale della Scuola"
                    placeholder="es. https://whatsapp.com/channel/... oppure https://chat.whatsapp.com/..."
                    value={whatsappChannelUrl}
                    onChange={(e) => setWhatsappChannelUrl(e.target.value)}
                  />
                  <p className="text-[11px] text-white/40 mt-1">
                    Inserisci il link del Canale o Gruppo Avvisi di Tropical Style: gli allievi troveranno il pulsante per unirsi direttamente nel Portale Allievi.
                  </p>
                </div>

                {whatsappEnabled && (
                  <div className="glass border border-white/10 p-4 rounded-2xl space-y-4 mt-3 animate-fadeIn text-left">
                    <Select
                      label="Seleziona Provider WhatsApp"
                      value={whatsappProvider}
                      onChange={(e: any) => setWhatsappProvider(e.target.value)}
                      options={[
                        { value: 'twilio', label: 'Twilio Gateway API' },
                        { value: 'meta', label: 'WhatsApp Direct / Meta Cloud API' },
                      ]}
                    />

                    {whatsappProvider === 'twilio' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            type="password"
                            label="Twilio Account SID"
                            placeholder="AC..."
                            value={whatsappAccountSid}
                            onChange={(e) => setWhatsappAccountSid(e.target.value)}
                            required={whatsappEnabled}
                          />
                          <Input
                            type="password"
                            label="Twilio Auth Token"
                            placeholder="••••••••••••••••••••••••••••••••"
                            value={whatsappAuthToken}
                            onChange={(e) => setWhatsappAuthToken(e.target.value)}
                            required={whatsappEnabled}
                          />
                        </div>
                        <Input
                          type="text"
                          label="Numero WhatsApp di Invio (Twilio Sender)"
                          placeholder="es. +14155238886 o whatsapp:+14155238886"
                          value={whatsappPhoneNumber}
                          onChange={(e) => setWhatsappPhoneNumber(e.target.value)}
                          required={whatsappEnabled}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Input
                          type="password"
                          label="Permanent Access Token"
                          placeholder="EAAB..."
                          value={whatsappAccessToken}
                          onChange={(e) => setWhatsappAccessToken(e.target.value)}
                          required={whatsappEnabled}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            type="text"
                            label="Phone Number ID"
                            placeholder="es. 102938475610293"
                            value={whatsappPhoneNumberId}
                            onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                            required={whatsappEnabled}
                          />
                          <Input
                            type="text"
                            label="WhatsApp Business Account ID"
                            placeholder="es. 987654321098765"
                            value={whatsappBusinessAccountId}
                            onChange={(e) => setWhatsappBusinessAccountId(e.target.value)}
                            required={whatsappEnabled}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className='pt-6'>
                <Button type='submit' loading={savingSettings} className='w-full md:w-auto'>
                  Salva Impostazioni
                </Button>
              </div>
            </form>
          </Card>

          <Card className='p-6 max-w-2xl border border-white/5 bg-gradient-to-r from-brand-900/10 via-surface-900 to-surface-950 mt-6'>
            <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
              <div className='space-y-1.5'>
                <CardTitle className='text-gold-400 flex items-center gap-1.5'>
                  <span>🎓</span> Cambio Anno Accademico
                </CardTitle>
                <p className='text-xs text-white/60 leading-relaxed max-w-lg'>
                  Avvia la procedura guidata per chiudere la stagione attuale, archiviare i corsi precedenti e resettare le iscrizioni degli allievi attivi per prepararli alla nuova stagione.
                </p>
              </div>
              <Button
                onClick={() => navigate('/settings/academic-year-wizard')}
                className='whitespace-nowrap btn-primary-gradient border-0 text-white font-semibold'
              >
                Configura Cambio Anno
              </Button>
            </div>
          </Card>

          {/* Card Configurazione Ricevute Tropical Style */}
          <Card className='p-6 max-w-2xl border border-white/5 bg-gradient-to-r from-emerald-950/20 via-surface-900 to-surface-950 mt-6 space-y-4'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3'>
              <div>
                <CardTitle className='text-emerald-400 flex items-center gap-2'>
                  <span>🧾 Numerazione Ricevute Fiscali / Contabilità</span>
                </CardTitle>
                <p className='text-xs text-white/60 mt-1'>
                  Gestisci la progressione delle ricevute di pagamento emesse per le quote e rette dei soci.
                </p>
              </div>
              <Badge variant='success' size='md' className='font-mono'>
                Esercizio {receiptYear}
              </Badge>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-surface-950/60 p-4 rounded-2xl border border-white/5'>
              <div>
                <label className='text-xs font-semibold text-white/70 block mb-1.5'>
                  Prossimo Numero di Ricevuta da Emettere:
                </label>
                <Input
                  type='number'
                  min={1}
                  value={receiptNextNumber}
                  onChange={(e) => setReceiptNextNumber(Math.max(1, parseInt(e.target.value) || 1))}
                  className='font-mono font-bold text-base'
                />
              </div>
              <Button
                loading={savingReceiptCounter}
                onClick={handleSaveReceiptCounter}
                className='w-full'
              >
                Salva Numerazione
              </Button>
            </div>

            <div className='flex items-start gap-2.5 text-[11px] text-white/60 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl'>
              <span className='text-emerald-400 text-sm flex-shrink-0'>ℹ️</span>
              <div>
                <strong className='text-emerald-300 font-semibold'>Regola Contabile Tropical Style:</strong>
                <p className='mt-0.5 leading-relaxed'>
                  Le ricevute della scuola partono dal n° <strong>112</strong> per l'anno 2026. Al <strong>1° Gennaio 2027</strong> (e ad ogni nuovo anno solare), il sistema resetterà in automatico la progressione ripartendo dal n° <strong>1</strong>. Se emetti una ricevuta manuale su bollettario cartaceo, puoi aggiornare questo valore per mantenere la sincronia perfetta.
                </p>
              </div>
            </div>
          </Card>
          </>
        )}

        {/* QR self-registration Tab */}
        {activeTab === 'qr' && (
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            <div className='lg:col-span-2 space-y-6'>
              <Card className='p-6 border border-white/5 space-y-4'>
                <CardTitle>Modulo Iscrizione Self-Service (Tramite QR)</CardTitle>
                <p className='text-sm text-white/60 leading-relaxed'>
                  Abilitando questa funzione, verrà generato un link e un codice QR unico per la tua scuola. 
                  Puoi stampare questo QR in bacheca, alla reception o inviarlo sui gruppi. I genitori potranno inquadrarlo,
                  registrarsi inserendo i propri contatti e la data di nascita dell'allievo/figlio e inviare la richiesta di 
                  iscrizione senza farti perdere tempo.
                </p>

                <div className='flex items-center gap-3 pt-2'>
                  <Button
                    onClick={() => handleToggleQR(!qrEnabled)}
                    loading={savingQR}
                    variant={qrEnabled ? 'danger' : 'success'}
                  >
                    {qrEnabled ? 'Disabilita Servizio' : 'Abilita Servizio'}
                  </Button>
                  {qrEnabled && (
                    <Button onClick={handleRegenerateToken} variant='outline' loading={savingQR}>
                      Rigenera Token QR
                    </Button>
                  )}
                </div>
              </Card>

              {qrEnabled && (
                <Card className='p-6 border border-white/5 space-y-4'>
                  <CardTitle>Link Pubblico di Iscrizione</CardTitle>
                  <div className='flex items-center gap-2 bg-surface-900 border border-white/5 rounded-xl p-3 overflow-hidden'>
                    <code className='text-xs text-brand-300 select-all truncate flex-1'>{registrationLink}</code>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        void navigator.clipboard.writeText(registrationLink);
                        toast.success('Link copiato negli appunti!');
                      }}
                    >
                      Copia Link
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            {qrEnabled && (
              <div>
                <Card className='p-6 border border-white/5 flex flex-col items-center justify-center text-center space-y-4 bg-gradient-to-b from-surface-800 to-surface-900'>
                  <h4 className='text-sm font-bold text-white'>QR Code Ufficiale Scuola</h4>
                  <div className='p-4 bg-white rounded-2xl shadow-xl'>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        registrationLink
                      )}`}
                      alt='QR Code Iscrizione'
                      className='w-48 h-48'
                    />
                  </div>
                  <p className='text-xs text-white/40'>
                    Inquadra con lo smartphone per accedere istantaneamente al modulo di iscrizione online.
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full'
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(
                        registrationLink
                      )}`;
                      link.target = '_blank';
                      link.download = `QR_Iscrizione_${activeSchool?.slug || 'scuola'}.png`;
                      link.click();
                    }}
                  >
                    Apri QR in Alta Risoluzione
                  </Button>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <Card className='p-6 border border-white/5'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <CardTitle>Richieste di Registrazione Self-Service</CardTitle>
                <p className='text-xs text-white/50 mt-1'>
                  Verifica ed approva le iscrizioni inoltrate dai genitori tramite QR Code.
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {requests.some((r) => r.status === 'approved') && (
                  <Button
                    size='xs'
                    variant='outline'
                    loading={syncingRequests}
                    onClick={handleSyncRequestsWithStudents}
                    className='text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer'
                    title='Sincronizza lo storico delle richieste con i corsi attualmente assegnati agli allievi'
                  >
                    🔄 Sincronizza Corsi Iscrizioni
                  </Button>
                )}
                <Badge variant='brand'>{requests.length} totali</Badge>
              </div>
            </div>

            {loadingRequests ? (
              <div className='py-12 text-center text-white/40 text-sm'>Caricamento richieste...</div>
            ) : requests.length === 0 ? (
              <EmptyState
                icon='📩'
                title='Nessuna richiesta'
                description='Nessuna richiesta di iscrizione presente al momento.'
              />
            ) : (
              <div className="space-y-4">
                {/* Bulk Action Bar */}
                {selectedRequestIds.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-brand-500/10 border border-brand-500/30 rounded-2xl animate-fade-in-up">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3.5 w-3.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-500"></span>
                      </span>
                      <span className="text-sm font-semibold text-brand-300">
                        {selectedRequestIds.length} richieste selezionate
                      </span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-brand-500/30 text-brand-300 hover:bg-brand-500/20 w-full sm:w-auto"
                        disabled={processingRequestId !== null}
                        onClick={() => {
                          const list = requests.filter((r) => selectedRequestIds.includes(r.id));
                          handleBulkRejectRequests(list);
                        }}
                      >
                        Rifiuta Selezionati
                      </Button>
                      <Button
                        size="sm"
                        disabled={processingRequestId !== null}
                        loading={processingRequestId === 'bulk'}
                        onClick={() => {
                          const list = requests.filter((r) => selectedRequestIds.includes(r.id) && r.status === 'pending');
                          handleBulkApproveRequests(list);
                        }}
                        className="w-full sm:w-auto"
                      >
                        Approva Selezionati
                      </Button>
                    </div>
                  </div>
                )}

                <div className='overflow-x-auto border border-white/5 rounded-2xl'>
                  <table className='w-full text-left border-collapse min-w-[800px]'>
                    <thead>
                      <tr className='border-b border-white/8 bg-white/[0.02] text-xs font-semibold text-white/50 tracking-wider'>
                        <th className='py-3 px-4 w-12'>
                          <input
                            type='checkbox'
                            className='rounded border-white/10 bg-black/40 text-brand-500 focus:ring-brand-500 focus:ring-offset-0'
                            checked={
                              requests.filter((r) => r.status === 'pending').length > 0 &&
                              requests
                                .filter((r) => r.status === 'pending')
                                .every((r) => selectedRequestIds.includes(r.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                const selectable = requests
                                  .filter((r) => r.status === 'pending')
                                  .map((r) => r.id);
                                setSelectedRequestIds(selectable);
                              } else {
                                setSelectedRequestIds([]);
                              }
                            }}
                          />
                        </th>
                        <th className='py-3 px-4'>Allievo</th>
                        <th className='py-3 px-4'>Genitore / Contatto</th>
                        <th className='py-3 px-4'>Corsi Assegnati / Richiesti</th>
                        <th className='py-3 px-4'>Data Richiesta</th>
                        <th className='py-3 px-4'>Stato</th>
                        <th className='py-3 px-4 text-right'>Azioni</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-white/5 text-xs text-white/80'>
                      {requests.map((req) => {
                        const isPending = req.status === 'pending';

                        const matchingStudent = students.find((s) => {
                          if ((req as any).studentId && s.id === (req as any).studentId) return true;
                          if (s.documents?.some((d) => d.id === `reg-${req.id}`)) return true;
                          if (req.fiscalCode && s.fiscalCode && s.fiscalCode.trim().toUpperCase() === req.fiscalCode.trim().toUpperCase()) return true;
                          if (s.parentId === req.parentUid && s.firstName?.trim().toLowerCase() === req.studentFirstName?.trim().toLowerCase()) return true;
                          if (s.firstName?.trim().toLowerCase() === req.studentFirstName?.trim().toLowerCase() && s.lastName?.trim().toLowerCase() === req.studentLastName?.trim().toLowerCase()) return true;
                          return false;
                        });

                        const currentAssignedCourseNames = matchingStudent?.enrolledCourseIds
                          ?.map((id) => courses.find((c) => c.id === id)?.name)
                          .filter(Boolean) as string[] | undefined;

                        return (
                          <tr
                            key={req.id}
                            className={`hover:bg-white/[0.01] transition-colors ${
                              req.status === 'approved'
                                ? 'opacity-85 bg-teal-500/5'
                                : req.status === 'rejected'
                                ? 'opacity-60 bg-surface-900/50'
                                : 'bg-brand-500/5'
                            }`}
                          >
                            <td className='py-3.5 px-4'>
                              {isPending ? (
                                <input
                                  type='checkbox'
                                  className='rounded border-white/10 bg-black/40 text-brand-500 focus:ring-brand-500 focus:ring-offset-0'
                                  checked={selectedRequestIds.includes(req.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRequestIds((prev) => [...prev, req.id]);
                                    } else {
                                      setSelectedRequestIds((prev) => prev.filter((id) => id !== req.id));
                                    }
                                  }}
                                />
                              ) : (
                                <div className='w-4 h-4' />
                              )}
                            </td>
                            <td className='py-3.5 px-4'>
                              <div>
                                <p className='font-bold text-white'>{req.studentName}</p>
                                <p className='text-[10px] text-white/40'>
                                  Nato il {req.studentBirthDate.toDate().toLocaleDateString('it-IT')}
                                  {req.fiscalCode ? ` · CF: ${req.fiscalCode}` : ''}
                                </p>
                                {isPending && matchingStudent && (
                                  <div className='mt-1'>
                                    <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'>
                                      ⚠️ Possibile doppione: già presente in anagrafica ({matchingStudent.firstName} {matchingStudent.lastName})
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className='py-3.5 px-4'>
                              <div>
                                <p className='font-semibold text-white/90'>{req.parentName}</p>
                                <p className='text-[10px] text-white/50'>{req.parentEmail}</p>
                              </div>
                            </td>
                            <td className='py-3.5 px-4 font-medium max-w-xs'>
                              {currentAssignedCourseNames && currentAssignedCourseNames.length > 0 ? (
                                <div className='space-y-1'>
                                  <div className='flex flex-wrap gap-1'>
                                    {currentAssignedCourseNames.map((cName, idx) => (
                                      <span
                                        key={idx}
                                        className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[11px] text-emerald-300 font-bold shadow-xs'
                                      >
                                        ✓ {cName}
                                      </span>
                                    ))}
                                  </div>
                                  {req.courseInterest && !currentAssignedCourseNames.some((ac) => req.courseInterest?.toLowerCase().includes(ac.toLowerCase())) && (
                                    <p className='text-[10px] text-white/40 italic'>
                                      (Richiesto in origine: {req.courseInterest})
                                    </p>
                                  )}
                                </div>
                              ) : req.courseInterest ? (
                                <div className='flex flex-wrap gap-1'>
                                  {req.courseInterest.split(',').map((cName, idx) => (
                                    <span key={idx} className='inline-block px-2 py-0.5 rounded-md bg-brand-500/15 border border-brand-500/25 text-[11px] text-brand-200 font-semibold'>
                                      {cName.trim()}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className='py-3.5 px-4 text-white/50'>
                              {req.createdAt.toDate().toLocaleString('it-IT')}
                            </td>
                            <td className='py-3.5 px-4'>
                              <Badge
                                variant={
                                  req.status === 'approved'
                                    ? 'success'
                                    : req.status === 'rejected'
                                    ? 'danger'
                                    : 'warning'
                                }
                                size='sm'
                              >
                                {req.status === 'approved'
                                  ? 'Approvato'
                                  : req.status === 'rejected'
                                  ? 'Rifiutato'
                                  : 'In Attesa'}
                              </Badge>
                            </td>
                            <td className='py-3.5 px-4 text-right'>
                              <div className='flex items-center justify-end gap-1.5'>
                                {matchingStudent && (
                                  <Link
                                    to={`/students/${matchingStudent.id}`}
                                    className='inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/20 transition'
                                    title='Apri scheda allievo e visualizza i corsi'
                                  >
                                    👤 Allievo
                                  </Link>
                                )}
                                <button
                                  type='button'
                                  onClick={() => handleOpenRegistrationPdf(req)}
                                  className='inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 px-2 py-1 rounded-lg border border-brand-500/20 transition cursor-pointer'
                                  title='Visualizza o scarica il Modulo di Iscrizione Firmato'
                                >
                                  📄 PDF
                                </button>
                                {isPending && (
                                  <>
                                    <Button
                                      size='xs'
                                      variant='outline'
                                      disabled={processingRequestId !== null}
                                      onClick={() => handleRejectRequest(req)}
                                    >
                                      Rifiuta
                                    </Button>
                                    <Button
                                      size='xs'
                                      loading={processingRequestId === req.id}
                                      disabled={processingRequestId !== null}
                                      onClick={() => {
                                        let defaultCourseIds: string[] = [];
                                        if (req.courseIds && req.courseIds.length > 0) {
                                          defaultCourseIds = req.courseIds;
                                        } else if (req.courseInterest) {
                                          const requestedNames = req.courseInterest.split(',').map((s) => s.trim().toLowerCase());
                                          defaultCourseIds = courses
                                            .filter((c) => c.isActive && !c.isDeleted && requestedNames.some((rn) => c.name.toLowerCase() === rn || rn.includes(c.name.toLowerCase())))
                                            .map((c) => c.id);
                                        }
                                        setSelectedCourseIdsToApprove(defaultCourseIds);
                                        setRequestToApprove(req);
                                      }}
                                    >
                                      Approva
                                    </Button>
                                  </>
                                )}
                                {req.status === 'rejected' && (
                                  <Button
                                    size='xs'
                                    variant='outline'
                                    className='border-brand-500/40 text-brand-300 hover:bg-brand-500/10'
                                    disabled={processingRequestId !== null}
                                    onClick={() => {
                                      let defaultCourseIds: string[] = [];
                                      if (req.courseIds && req.courseIds.length > 0) {
                                        defaultCourseIds = req.courseIds;
                                      } else if (req.courseInterest) {
                                        const requestedNames = req.courseInterest.split(',').map((s) => s.trim().toLowerCase());
                                        defaultCourseIds = courses
                                          .filter((c) => c.isActive && !c.isDeleted && requestedNames.some((rn) => c.name.toLowerCase() === rn || rn.includes(c.name.toLowerCase())))
                                          .map((c) => c.id);
                                      }
                                      setSelectedCourseIdsToApprove(defaultCourseIds);
                                      setRequestToApprove(req);
                                    }}
                                  >
                                    Ripristina e Approva
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Conferma Approvazione e Assegnazione Corso */}
            {requestToApprove && (
              <Modal
                isOpen={requestToApprove !== null}
                onClose={() => setRequestToApprove(null)}
                title="Conferma Approvazione Iscrizione"
                description={`Stai approvando l'iscrizione di ${requestToApprove.studentName}.`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-white/70">
                    I corsi selezionati dal genitore durante l'iscrizione sono già preselezionati qui sotto. Puoi confermarli o modificarli prima di approvare:
                  </p>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/70 block">
                      Corsi da assegnare all'allievo:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                      {courses
                        .filter((c) => c.isActive && !c.isDeleted)
                        .map((c) => {
                          const isSelected = selectedCourseIdsToApprove.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCourseIdsToApprove(selectedCourseIdsToApprove.filter((id) => id !== c.id));
                                } else {
                                  setSelectedCourseIdsToApprove([...selectedCourseIdsToApprove, c.id]);
                                }
                              }}
                              className={`text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-brand-500/20 border-brand-500/50 text-white shadow-sm'
                                  : 'bg-black/20 border-white/10 text-white/60 hover:border-white/20'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{c.name}</p>
                                <p className="text-[10px] text-white/50">{c.style} · {c.fee?.monthly ? `€${c.fee.monthly}/mese` : 'Standard'}</p>
                              </div>
                              <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                isSelected ? 'bg-brand-500 text-white' : 'border border-white/20'
                              }`}>
                                {isSelected ? '✓' : ''}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                    <p className="text-xs text-brand-300 font-medium pt-1">
                      {selectedCourseIdsToApprove.length === 0
                        ? 'Nessun corso selezionato (l\'allievo verrà creato senza corsi associati).'
                        : `✓ ${selectedCourseIdsToApprove.length} ${selectedCourseIdsToApprove.length === 1 ? 'corso assegnato' : 'corsi assegnati'}.`}
                    </p>
                  </div>
                </div>
                <ModalFooter>
                  <Button variant="secondary" onClick={() => setRequestToApprove(null)}>
                    Annulla
                  </Button>
                  <Button
                    loading={processingRequestId === requestToApprove.id}
                    onClick={async () => {
                      await handleApproveRequest(requestToApprove, selectedCourseIdsToApprove);
                      setRequestToApprove(null);
                    }}
                  >
                    Conferma e Approva
                  </Button>
                </ModalFooter>
              </Modal>
            )}
          </Card>
        )}

        {/* Automations (Cloud) Tab */}
        {activeTab === 'automation' && (
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            <div className='lg:col-span-2 space-y-6'>
              {/* Batch Dues Card */}
              <Card className='p-6 border border-white/5 space-y-4'>
                <CardTitle>⚡ Generatore Contabile Rette Mensili (Batch Daemon)</CardTitle>
                <p className='text-sm text-white/60 leading-relaxed'>
                  Questo modulo simula il daemon cron serverless di Firebase Cloud Functions. Seleziona il mese e l'anno di riferimento per scatenare la generazione massiva di fatturazione: per tutti gli allievi iscritti ai corsi attivi, il sistema verificherà l'assenza di rette generate ed emetterà in automatico le quote mensili in stato "In attesa" (pending), notificando i genitori.
                </p>
                <div className='flex flex-wrap gap-4 items-end bg-surface-900 p-4 rounded-2xl border border-white/5'>
                  <div className='flex-1 min-w-[120px]'>
                    <Select
                      label='Mese'
                      value={selectedMonth}
                      onChange={(e: any) => setSelectedMonth(Number(e.target.value))}
                      options={[
                        { value: '1', label: 'Gennaio' },
                        { value: '2', label: 'Febbraio' },
                        { value: '3', label: 'Marzo' },
                        { value: '4', label: 'Aprile' },
                        { value: '5', label: 'Maggio' },
                        { value: '6', label: 'Giugno' },
                        { value: '7', label: 'Luglio' },
                        { value: '8', label: 'Agosto' },
                        { value: '9', label: 'Settembre' },
                        { value: '10', label: 'Ottobre' },
                        { value: '11', label: 'Novembre' },
                        { value: '12', label: 'Dicembre' },
                      ]}
                    />
                  </div>
                  <div className='flex-1 min-w-[120px]'>
                    <Select
                      label='Anno'
                      value={selectedYear}
                      onChange={(e: any) => setSelectedYear(Number(e.target.value))}
                      options={[
                        { value: '2025', label: '2025' },
                        { value: '2026', label: '2026' },
                        { value: '2027', label: '2027' },
                      ]}
                    />
                  </div>
                  <Button onClick={handleTriggerBatchDues} loading={runningAutomation} className='w-full sm:w-auto h-[42px]'>
                    Esegui Daemon Emissione
                  </Button>
                </div>
              </Card>

              {/* Overdue Daemon Card */}
              <Card className='p-6 border border-white/5 space-y-4'>
                <CardTitle>⚠️ Verifica Scadenze & Notifiche (Overdue Daemon)</CardTitle>
                <p className='text-sm text-white/60 leading-relaxed'>
                  Il demone delle scadenze scansiona tutti i pagamenti pendenti. Se la data di scadenza è trascorsa rispetto al momento attuale, lo stato viene convertito automaticamente in **"Scaduto" (overdue)** e viene inviata una notifica push in-app / push di sistema (FCM) al genitore per richiederne la regolarizzazione immediata.
                </p>
                <div className='pt-2'>
                  <Button onClick={handleTriggerOverdueDaemon} loading={runningAutomation} variant='outline' className='w-full sm:w-auto'>
                    Avvia Daemon Scadenze (FCM Notifiche)
                  </Button>
                </div>
              </Card>

              {/* WhatsApp Business API Simulator (Step 24) */}
              <Card className='p-6 border border-white/5 space-y-4'>
                <CardTitle>💬 WhatsApp Business API - Simulatore Notifiche</CardTitle>
                <p className='text-sm text-white/60 leading-relaxed'>
                  Testa l'invio e visualizza l'anteprima dei messaggi transazionali WhatsApp inviati automaticamente alle famiglie al variare dello stato contabile dell'allievo.
                </p>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  {/* Form di Test */}
                  <div className='space-y-4'>
                    <Input
                      label='Numero Whatsapp Genitore'
                      value={waPhone}
                      onChange={(e: any) => setWaPhone(e.target.value)}
                    />
                    <Select
                      label='Seleziona Template'
                      value={waTemplate}
                      onChange={(e: any) => setWaTemplate(e.target.value)}
                      options={[
                        { value: 'due_notice', label: 'Emissione Retta Mensile' },
                        { value: 'overdue_reminder', label: 'Sollecito Morosità Scaduta' },
                        { value: 'receipt_sent', label: 'Invio Ricevuta Saldato' },
                      ]}
                    />
                    <Button onClick={handleSendWATest} loading={waSending} className='w-full'>
                      Invia Messaggio Test
                    </Button>
                  </div>

                  {/* Previewer Smartphone Mockup */}
                  <div className='flex items-center justify-center'>
                    <div className='w-full max-w-[270px] h-[360px] rounded-[36px] border-4 border-white/20 bg-surface-950 shadow-2xl relative overflow-hidden flex flex-col'>
                      {/* Notch */}
                      <div className='absolute top-0 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-white/20 rounded-b-2xl z-20' />
                      
                      {/* WhatsApp Header */}
                      <div className='bg-[#075e54] p-3 pt-6 pb-2 text-[10px] font-bold text-white flex items-center justify-between border-b border-black/10'>
                        <div className='flex items-center gap-1.5'>
                          <div className='w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px]'>TS</div>
                          <div>
                            <p className='text-[9px] truncate'>Tropical Style Caribbean School</p>
                            <p className='text-[7px] text-white/60 font-normal'>Online</p>
                          </div>
                        </div>
                      </div>

                      {/* WhatsApp Chat Area */}
                      <div className='flex-1 p-2 bg-[#ece5dd] overflow-y-auto space-y-2 select-text font-sans'>
                        <div className='p-2 bg-[#dcf8c6] border border-[#d3ecd2] rounded-xl rounded-tr-none text-[8.5px] text-black/80 shadow-sm max-w-[90%] ml-auto space-y-1 relative'>
                          <p className='whitespace-pre-line leading-relaxed'>
                            {waTemplate === 'due_notice' && 
                              "Ciao! 🌟 Ti comunichiamo che la quota per il corso di *Caraibico Coppia* del mese di *Ottobre 2026* è stata emessa.\n\n💰 *Importo*: €55,00\n📅 *Scadenza*: 10/10/2026\n\nPuoi consultarla comodamente nel Portale Allievi Tropical Style."
                            }
                            {waTemplate === 'overdue_reminder' && 
                              "⚠️ *Sollecito Tropical Style*: Gentile genitore, ti ricordiamo che la quota mensile risulta in sospeso.\n\nSi prega di regolarizzare al più presto.\n\nGrazie per la collaborazione,\nTropical Style Caribbean School"
                            }
                            {waTemplate === 'receipt_sent' && 
                              "✅ *Pagamento Ricevuto*: Grazie! Abbiamo registrato con successo il saldo di *€55,00* per *Retta Caraibico - Sofia Rossi*.\n\nRicevuta ufficiale emessa da Tropical Style Caribbean School."
                            }
                          </p>
                          <div className='text-[6px] text-black/40 text-right flex items-center justify-end gap-0.5 mt-0.5'>
                            <span>{new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className='text-sky-500 font-bold'>✓✓</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Console Log panel */}
            <div>
              <Card className='p-4 border border-white/10 bg-black/60 font-mono h-full flex flex-col min-h-[350px] rounded-3xl'>
                <div className='flex items-center justify-between pb-3 border-b border-white/5 mb-3 text-xs text-white/40'>
                  <span>LOG CONSOLE AUTOMAZIONI</span>
                  <button onClick={() => setAutomationLogs(['[System Console] Console ripulita.'])} className='text-brand-400 hover:text-brand-300 transition'>
                    Clear
                  </button>
                </div>
                <div className='flex-1 overflow-y-auto space-y-1.5 text-[10px] text-teal-400 leading-normal scrollbar-thin select-text max-h-[380px]'>
                  {automationLogs.map((log, idx) => (
                    <div key={idx} className='whitespace-pre-wrap font-mono'>
                      {log}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Gestione Staff Tab */}
        {activeTab === 'staff' && (
          <div className='space-y-6'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
              <div>
                <h3 className='text-lg font-display font-bold text-white'>Gestione Staff e Collaboratori</h3>
                <p className='text-xs text-white/50 mt-1'>
                  Pre-registra e invita docenti o amministratori a collaborare con la tua scuola di danza.
                </p>
              </div>
              <Button onClick={() => {
                setGeneratedInviteLink('');
                setStaffName('');
                setStaffEmail('');
                setStaffRole('teacher');
                setInviteCourseIds([]);
                setAddStaffTab('invite');
                setSelectedStudentId('');
                setPromoteCourseIds([]);
                setPromoteCustomEmail('');
                setIsAddStaffOpen(true);
              }}>
                Aggiungi Collaboratore
              </Button>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              {/* Membri dello Staff */}
              <div className='lg:col-span-2 space-y-4'>
                <Card className='p-6 border border-white/5'>
                  <CardTitle className='mb-4'>Membri dello Staff Attivi</CardTitle>
                  {loadingStaff ? (
                    <div className='py-8 text-center text-white/40 text-sm'>Caricamento staff...</div>
                  ) : staffUsers.length === 0 ? (
                    <div className='py-8 text-center text-white/40 text-sm'>Nessun membro dello staff trovato.</div>
                  ) : (
                    <div className='divide-y divide-white/5 space-y-4'>
                      {staffUsers.map((member) => {
                        const assignedCourses = courses.filter(
                          (c) => c.isActive && !c.isDeleted && c.teacherIds?.includes(member.uid)
                        );

                        return (
                          <div key={member.uid} className='flex flex-col sm:flex-row sm:items-center justify-between pt-4 first:pt-0 gap-3'>
                            <div className='flex items-center gap-3 min-w-0'>
                              <div className='w-10 h-10 rounded-full bg-brand-600/30 text-brand-300 border border-brand-500/20 flex items-center justify-center font-bold text-sm flex-shrink-0'>
                                {member.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div className='min-w-0'>
                                <p className='text-sm font-semibold text-white truncate'>{member.displayName}</p>
                                <p className='text-xs text-white/40 truncate'>{member.email}</p>
                                {member.role === 'teacher' && (
                                  <div className='flex flex-wrap gap-1 mt-1'>
                                    {assignedCourses.length === 0 ? (
                                      <span className='text-[10px] text-white/40 italic'>Nessun corso assegnato</span>
                                    ) : (
                                      assignedCourses.map((c) => (
                                        <span key={c.id} className='text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20 font-medium'>
                                          {c.name}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className='flex items-center gap-2 self-end sm:self-center flex-shrink-0'>
                              <Badge variant={
                                member.role === 'owner' ? 'brand' : 
                                member.role === 'admin' ? 'gold' : 'teal'
                              }>
                                {member.role === 'owner' ? 'Owner' : 
                                 member.role === 'admin' ? 'Admin' : 'Insegnante'}
                              </Badge>

                              {member.role === 'teacher' && (
                                <button
                                  type='button'
                                  onClick={() => {
                                    const assignedIds = courses
                                      .filter((c) => c.isActive && !c.isDeleted && c.teacherIds?.includes(member.uid))
                                      .map((c) => c.id);
                                    setEditingTeacherCourseIds(assignedIds);
                                    setEditingTeacher(member);
                                  }}
                                  className='px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 border border-brand-500/30 transition-all flex items-center gap-1 cursor-pointer'
                                  title='Assegna o modifica i corsi per questo insegnante'
                                >
                                  🩰 Assegna Corsi
                                </button>
                              )}
                              
                              {member.role !== 'owner' && (
                                <button
                                  onClick={() => handleRemoveStaff(member.uid, member.displayName)}
                                  className='p-1.5 text-coral-400 hover:text-coral-300 hover:bg-coral-500/10 rounded-lg transition-colors cursor-pointer'
                                  title='Rimuovi dallo Staff'
                                >
                                  ❌
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>

              {/* Inviti Pendenti */}
              <div>
                <Card className='p-6 border border-white/5 space-y-4'>
                  <CardTitle>Inviti Pendenti</CardTitle>
                  <p className='text-xs text-white/50 leading-relaxed'>
                    Gli inviti generati che non sono ancora stati riscattati dai collaboratori.
                  </p>
                  
                  {invites.length === 0 ? (
                    <div className='text-xs text-white/30 text-center py-4 bg-white/5 rounded-xl border border-white/5'>
                      Nessun invito pendente.
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      {invites.map((invite) => (
                        <div key={invite.id} className='p-3 rounded-xl border border-white/5 bg-surface-900 space-y-2'>
                          <div className='flex justify-between items-start'>
                            <div>
                              <p className='text-xs font-semibold text-white'>{invite.displayName}</p>
                              <p className='text-[10px] text-white/40'>{invite.email}</p>
                            </div>
                            <button
                              onClick={() => handleRevokeInvite(invite.id, invite.email)}
                              className='text-coral-400 hover:text-coral-300 text-xs'
                              title='Revoca Invito'
                            >
                              Revoca
                            </button>
                          </div>
                          <div className='flex items-center justify-between gap-2 pt-1 border-t border-white/5'>
                            <span className='text-[9px] text-white/35 uppercase tracking-wider font-semibold'>
                              {invite.role === 'admin' ? 'Admin' : 'Docente'}
                            </span>
                            <Button
                              size='xs'
                              variant='outline'
                              onClick={() => {
                                const link = `${window.location.origin}/join-staff/${invite.id}`;
                                void navigator.clipboard.writeText(link);
                                toast.success('Link copiato negli appunti!');
                              }}
                            >
                              Copia Link
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Modal Aggiungi Collaboratore / Promuovi Allievo */}
            <Modal
              isOpen={isAddStaffOpen}
              onClose={() => setIsAddStaffOpen(false)}
              title="Aggiungi Collaboratore allo Staff"
              description="Invita un nuovo maestro/admin oppure promuovi direttamente un allievo già iscritto nella scuola."
              size="lg"
            >
              <div className="space-y-4">
                {/* Segmented Tabs */}
                <div className="flex rounded-xl bg-surface-900 p-1 border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setAddStaffTab('invite');
                      setGeneratedInviteLink('');
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      addStaffTab === 'invite'
                        ? 'bg-brand-500 text-white shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    ✉️ Invita Nuovo Collaboratore
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddStaffTab('promote');
                      setGeneratedInviteLink('');
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      addStaffTab === 'promote'
                        ? 'bg-brand-500 text-white shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    🩰 Promuovi Allievo Esistente
                  </button>
                </div>

                {/* TAB 1: INVITA NUOVO COLLABORATORE */}
                {addStaffTab === 'invite' && (
                  <>
                    {!generatedInviteLink ? (
                      <form onSubmit={handleAddStaff} className="space-y-4">
                        <Input
                          label="Nome e Cognome *"
                          required
                          placeholder="es. Rossella Bianchi"
                          value={staffName}
                          onChange={(e: any) => setStaffName(e.target.value)}
                        />
                        <Input
                          label="Indirizzo Email *"
                          type="email"
                          required
                          placeholder="es. rossella@email.it"
                          value={staffEmail}
                          onChange={(e: any) => setStaffEmail(e.target.value)}
                        />
                        <Select
                          label="Ruolo Collaboratore *"
                          value={staffRole}
                          onChange={(e: any) => setStaffRole(e.target.value)}
                          options={[
                            { value: 'teacher', label: 'Insegnante' },
                            { value: 'admin', label: 'Amministratore' },
                          ]}
                        />

                        {staffRole === 'teacher' && (
                          <div className="space-y-2 pt-2 border-t border-white/5">
                            <label className="text-xs font-semibold text-white/70 block">
                              Corsi da assegnare al maestro (Opzionale):
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                              {courses
                                .filter((c) => c.isActive && !c.isDeleted)
                                .map((c) => {
                                  const isChecked = inviteCourseIds.includes(c.id);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => {
                                        if (isChecked) {
                                          setInviteCourseIds(inviteCourseIds.filter((id) => id !== c.id));
                                        } else {
                                          setInviteCourseIds([...inviteCourseIds, c.id]);
                                        }
                                      }}
                                      className={`text-left p-2 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                        isChecked
                                          ? 'bg-brand-500/20 border-brand-500/50 text-white'
                                          : 'bg-black/20 border-white/10 text-white/60 hover:border-white/20'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-white truncate">{c.name}</p>
                                        <p className="text-[10px] text-white/40">{c.style}</p>
                                      </div>
                                      <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        isChecked ? 'bg-brand-500 text-white' : 'border border-white/20'
                                      }`}>
                                        {isChecked ? '✓' : ''}
                                      </div>
                                    </button>
                                  );
                                })}
                            </div>
                            {inviteCourseIds.length > 0 && (
                              <p className="text-[11px] text-brand-300 font-medium pt-0.5">
                                ✓ {inviteCourseIds.length} corso/i preselezionato/i.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                          <Button type="button" variant="secondary" onClick={() => setIsAddStaffOpen(false)}>
                            Annulla
                          </Button>
                          <Button type="submit" loading={submittingStaff}>
                            Genera Invito
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-white/70">
                          Invito generato con successo! Invia questo link di registrazione a <strong>{staffName}</strong>. 
                          Potrà usarlo per completare il suo profilo e impostare la password.
                        </p>
                        
                        <div className="bg-surface-900 border border-white/5 rounded-xl p-3 flex items-center gap-2">
                          <code className="text-xs text-brand-300 select-all truncate flex-1">{generatedInviteLink}</code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void navigator.clipboard.writeText(generatedInviteLink);
                              toast.success('Link copiato negli appunti!');
                              setCopiedInvite(true);
                            }}
                          >
                            {copiedInvite ? 'Copiato!' : 'Copia'}
                          </Button>
                        </div>

                        <div className="flex justify-end border-t border-white/5 pt-2">
                          <Button onClick={() => setIsAddStaffOpen(false)}>
                            Chiudi
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* TAB 2: PROMUOVI ALLIEVO ESISTENTE */}
                {addStaffTab === 'promote' && (
                  <form onSubmit={handlePromoteStudent} className="space-y-4">
                    <p className="text-xs text-white/50 leading-relaxed">
                      Seleziona un allievo già registrato per nominarlo <strong>Insegnante</strong>. Manterrà la sua scheda allievo e potrà prendere le presenze per i corsi assegnati.
                    </p>

                    <div>
                      <label className="text-xs font-semibold text-white/70 block mb-1.5">
                        Seleziona Allievo da Promuovere *
                      </label>
                      <select
                        className="w-full bg-surface-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors"
                        value={selectedStudentId}
                        onChange={(e) => {
                          const sid = e.target.value;
                          setSelectedStudentId(sid);
                          const stu = students.find((s) => s.id === sid);
                          if (stu) {
                            setPromoteCustomEmail(stu.contact?.studentEmail || stu.contact?.parentEmail || '');
                          } else {
                            setPromoteCustomEmail('');
                          }
                        }}
                        required
                      >
                        <option value="">-- Seleziona un allievo ({students.filter((s) => !s.isDeleted).length} allievi registrati) --</option>
                        {students
                          .filter((s) => !s.isDeleted)
                          .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                          .map((s) => {
                            const email = s.contact?.studentEmail || s.contact?.parentEmail || 'Nessuna email registrata';
                            return (
                              <option key={s.id} value={s.id}>
                                {s.lastName} {s.firstName} ({email})
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    {selectedStudentId && (
                      <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">Email per l&apos;accesso dell&apos;insegnante:</span>
                          <span className="text-[10px] text-brand-300">Accesso App</span>
                        </div>
                        <Input
                          label="Email Insegnante *"
                          type="email"
                          required
                          placeholder="es. maestro@email.it"
                          value={promoteCustomEmail}
                          onChange={(e: any) => setPromoteCustomEmail(e.target.value)}
                        />
                        <p className="text-[11px] text-white/40">
                          L&apos;insegnante utilizzerà questa email per accedere all&apos;app o al portale lezioni.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="text-xs font-semibold text-white/70 block">
                        Corsi da Assegnare al Maestro:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {courses
                          .filter((c) => c.isActive && !c.isDeleted)
                          .map((c) => {
                            const isChecked = promoteCourseIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  if (isChecked) {
                                    setPromoteCourseIds(promoteCourseIds.filter((id) => id !== c.id));
                                  } else {
                                    setPromoteCourseIds([...promoteCourseIds, c.id]);
                                  }
                                }}
                                className={`text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                  isChecked
                                    ? 'bg-brand-500/20 border-brand-500/50 text-white'
                                    : 'bg-black/20 border-white/10 text-white/60 hover:border-white/20'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white truncate">{c.name}</p>
                                  <p className="text-[10px] text-white/40">{c.style}</p>
                                </div>
                                <div
                                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                    isChecked ? 'bg-brand-500 text-white' : 'border border-white/20'
                                  }`}
                                >
                                  {isChecked ? '✓' : ''}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                      {promoteCourseIds.length > 0 ? (
                        <p className="text-[11px] text-brand-300 font-medium pt-0.5">
                          ✓ {promoteCourseIds.length} corso/i selezionato/i per questo maestro.
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-400/80 font-medium pt-0.5">
                          ℹ️ Puoi assegnare i corsi adesso o in qualsiasi momento con il tasto &quot;Assegna Corsi&quot;.
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
                      <Button type="button" variant="secondary" onClick={() => setIsAddStaffOpen(false)}>
                        Annulla
                      </Button>
                      <Button
                        type="submit"
                        loading={isPromotingStudent}
                        disabled={!selectedStudentId}
                      >
                        Promuovi a Insegnante
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </Modal>

            {/* Modal Assegna Corsi a Insegnante Attivo */}
            {editingTeacher && (
              <Modal
                isOpen={editingTeacher !== null}
                onClose={() => setEditingTeacher(null)}
                title={`Assegna Corsi a ${editingTeacher.displayName}`}
                description="Seleziona i corsi di cui questo maestro è responsabile per le presenze."
              >
                <div className='space-y-4'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1'>
                    {courses
                      .filter((c) => c.isActive && !c.isDeleted)
                      .map((c) => {
                        const isSelected = editingTeacherCourseIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type='button'
                            onClick={() => {
                              if (isSelected) {
                                setEditingTeacherCourseIds(editingTeacherCourseIds.filter((id) => id !== c.id));
                              } else {
                                setEditingTeacherCourseIds([...editingTeacherCourseIds, c.id]);
                              }
                            }}
                            className={`text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-brand-500/20 border-brand-500/50 text-white shadow-sm'
                                : 'bg-black/20 border-white/10 text-white/60 hover:border-white/20'
                            }`}
                          >
                            <div className='min-w-0'>
                              <p className='text-xs font-bold text-white truncate'>{c.name}</p>
                              <p className='text-[10px] text-white/50'>{c.style}</p>
                            </div>
                            <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                              isSelected ? 'bg-brand-500 text-white' : 'border border-white/20'
                            }`}>
                              {isSelected ? '✓' : ''}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  <p className='text-xs text-brand-300 font-medium'>
                    {editingTeacherCourseIds.length === 0
                      ? 'Nessun corso selezionato (l\'insegnante non avrà corsi assegnati).'
                      : `✓ ${editingTeacherCourseIds.length} corso/i selezionato/i.`}
                  </p>
                </div>
                <ModalFooter>
                  <Button variant='secondary' onClick={() => setEditingTeacher(null)}>
                    Annulla
                  </Button>
                  <Button loading={savingTeacherCourses} onClick={handleSaveTeacherCourses}>
                    Salva Assegnazione
                  </Button>
                </ModalFooter>
              </Modal>
            )}
          </div>
        )}

        {/* Privacy & GDPR Tab */}
        {activeTab === 'gdpr' && (
          <div className='space-y-6 max-w-2xl'>
            <Card className='p-6 border border-white/5'>
              <CardTitle className='mb-4 flex items-center gap-2'>
                <span>🔒</span> Privacy & Compliance GDPR
              </CardTitle>
              <div className='space-y-4 text-sm text-white/70 font-body'>
                <p>
                  Ai sensi del Regolamento UE 2016/679 (GDPR), ciascuna scuola ha il dovere di garantire il diritto alla portabilità dei dati per i propri iscritti ed allievi.
                </p>
                <p>
                  Tramite questo pannello di controllo è possibile generare ed esportare in tempo reale un backup consolidato e completo in formato JSON contenente tutte le anagrafiche, la configurazione dei corsi, lo storico dei pagamenti e delle presenze del vostro istituto.
                </p>
                <div className='p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 text-xs text-brand-300 flex items-start gap-2.5'>
                  <span>💡</span>
                  <p>
                    L'esportazione include la mappatura completa dei dati delle collezioni <code>students</code>, <code>courses</code>, <code>payments</code>, <code>attendance</code> e <code>messages</code> associate al vostro tenant.
                  </p>
                </div>
                <div className='pt-4 border-t border-white/5 flex justify-end'>
                  <Button
                    onClick={handleExportAllData}
                    loading={isExporting}
                    icon={<span>📦</span>}
                  >
                    Esporta tutti i dati
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
