import { useState, useEffect } from 'react';
import { doc, updateDoc, collection, onSnapshot, query, setDoc, getDoc, getDocs, where, Timestamp, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Input, Select, Button, Badge, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { COLLECTIONS, nowTimestamp, userConverter } from '@/lib/converters';
import toast from 'react-hot-toast';
import type { AppUser } from '@/types';

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
  pdfUrl?: string;
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
  const [submittingStaff, setSubmittingStaff] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  // School Settings Local State
  const [currency, setCurrency] = useState<'EUR' | 'USD' | 'GBP'>('EUR');
  const [academicYearStart, setAcademicYearStart] = useState(9);
  const [paymentDueDay, setPaymentDueDay] = useState(10);
  const [allowParentPortal, setAllowParentPortal] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
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

  // QR Registration Local State
  const [qrEnabled, setQrEnabled] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [savingQR, setSavingQR] = useState(false);

  // Requests State
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  // Sync state with activeSchool
  useEffect(() => {
    if (activeSchool) {
      setCurrency(activeSchool.settings.currency || 'EUR');
      setAcademicYearStart(activeSchool.settings.academicYearStart ?? 9);
      setPaymentDueDay(activeSchool.settings.paymentDueDay ?? 10);
      setAllowParentPortal(activeSchool.settings.allowParentPortal ?? true);
      setNotificationsEnabled(activeSchool.settings.notificationsEnabled ?? true);
      setWhatsappEnabled(activeSchool.settings.whatsappEnabled ?? false);

      setQrEnabled(activeSchool.settings.registrationQR?.enabled ?? false);
      setQrToken(activeSchool.settings.registrationQR?.token ?? '');
    }
  }, [activeSchool]);

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

  const handleRemoveStaff = async (userId: string, name: string) => {
    if (!activeSchool) return;
    
    // Safety check: Cannot remove yourself
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.uid === userId) {
      toast.error('Non puoi rimuovere te stesso!');
      return;
    }

    const confirmRemove = window.confirm(`Sei sicuro di voler rimuovere ${name} dallo staff? Perderà l'accesso all'istante.`);
    if (!confirmRemove) return;

    try {
      const userRef = doc(db, COLLECTIONS.users, userId);
      await updateDoc(userRef, {
        schoolId: null, // disconnect from school
        role: 'parent', // default role
        updatedAt: nowTimestamp(),
      });
      toast.success(`${name} rimosso con successo.`);
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
      };

      await updateDoc(schoolRef, {
        settings: updatedSettings,
        updatedAt: nowTimestamp(),
      });

      setActiveSchool({
        ...activeSchool,
        settings: updatedSettings,
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
  const handleApproveRequest = async (req: RegistrationRequest) => {
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
      // 1. Crea il record dello studente in schools/{schoolId}/students
      const studentId = Math.random().toString(36).substring(2, 15);
      const studentRef = doc(db, COLLECTIONS.students(activeSchool.id), studentId);

      await setDoc(studentRef, {
        id: studentId,
        schoolId: activeSchool.id,
        firstName: req.studentFirstName,
        lastName: req.studentLastName,
        dateOfBirth: req.studentBirthDate,
        gender: req.gender || 'Other',
        isActive: true,
        isDeleted: false,
        parentId: req.parentUid,
        enrolledCourseIds: req.courseInterest ? [req.courseInterest] : [],
        documents: req.pdfUrl ? [{
          id: Math.random().toString(36).substring(2, 15),
          name: 'Modulo Iscrizione Firmato.pdf',
          type: 'consent',
          fileURL: req.pdfUrl,
          uploadedAt: nowTimestamp(),
          notes: `Firma Elettronica Semplice (FES) IP: ${req.signatureMetadata?.ipAddress || 'N/D'} - Hash: ${req.sha256Hash || 'N/D'}`,
        }] : [],
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

      // 2. Attiva il genitore impostando isActive = true nel documento users/{parentUid}
      const userRef = doc(db, COLLECTIONS.users, req.parentUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          isActive: true,
          updatedAt: nowTimestamp(),
        });
      }

      // 3. Aggiorna lo stato della richiesta in 'approved'
      const requestRef = doc(db, `schools/${activeSchool.id}/registrationRequests`, req.id);
      await updateDoc(requestRef, {
        status: 'approved',
      });

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

      toast.success('Richiesta rifiutata.');
    } catch (err: any) {
      console.error('[Settings] Rejection failed:', err);
      toast.error(err.message || 'Impossibile rifiutare la richiesta.');
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

  const registrationLink = `${window.location.origin}/join/${qrToken}`;

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
              </div>

              <div className='pt-6'>
                <Button type='submit' loading={savingSettings} className='w-full md:w-auto'>
                  Salva Impostazioni
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* QR self-registration Tab */}
        {activeTab === 'qr' && (
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            <div className='lg:col-span-2 space-y-6'>
              <Card className='p-6 border border-white/5 space-y-4'>
                <CardTitle>Modulo Iscrizione Self-Service (Tramite QR)</CardTitle>
                <p className='text-sm text-white/60 leading-relaxed'>
                  Abilitando questa funzione, DanceFlow genererà un link e un codice QR unico per la tua scuola. 
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
              <Badge variant='brand'>{requests.length} totali</Badge>
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
              <div className='space-y-4 max-h-[500px] overflow-y-auto pr-2'>
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      req.status === 'pending'
                        ? 'border-brand-500/20 bg-brand-500/5'
                        : req.status === 'approved'
                        ? 'border-teal-500/10 bg-teal-500/2 opacity-80'
                        : 'border-white/5 bg-surface-900/50 opacity-60'
                    } flex flex-col md:flex-row md:items-center justify-between gap-4`}
                  >
                    <div className='space-y-1.5'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <h4 className='text-sm font-bold text-white'>{req.studentName}</h4>
                        <Badge
                          variant={
                            req.status === 'approved'
                              ? 'teal'
                              : req.status === 'rejected'
                              ? 'coral'
                              : 'gold'
                          }
                        >
                          {req.status === 'approved'
                            ? 'Approvato'
                            : req.status === 'rejected'
                            ? 'Rifiutato'
                            : 'In Attesa'}
                        </Badge>
                      </div>
                      <div className='text-xs text-white/60 space-y-0.5'>
                        <p>
                          <span className='text-white/40'>Genitore:</span> {req.parentName} ({req.parentEmail})
                        </p>
                        <p>
                          <span className='text-white/40'>Data Nascita Allievo:</span>{' '}
                          {req.studentBirthDate.toDate().toLocaleDateString('it-IT')}
                        </p>
                        {req.courseInterest && (
                          <p>
                            <span className='text-brand-300 font-medium'>Richiede Corso:</span> {req.courseInterest}
                          </p>
                        )}
                        <p className='text-[10px] text-white/30'>
                          Ricevuta il {req.createdAt.toDate().toLocaleString('it-IT')}
                        </p>
                      </div>
                    </div>

                    {req.status === 'pending' && (
                      <div className='flex items-center gap-2 self-end md:self-center'>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={processingRequestId !== null}
                          onClick={() => handleRejectRequest(req)}
                        >
                          Rifiuta
                        </Button>
                        <Button
                          size='sm'
                          loading={processingRequestId === req.id}
                          disabled={processingRequestId !== null}
                          onClick={() => handleApproveRequest(req)}
                        >
                          Approva & Crea Allievo
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
                          <div className='w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px]'>DF</div>
                          <div>
                            <p className='text-[9px] truncate'>DanceFlow Assistenza</p>
                            <p className='text-[7px] text-white/60 font-normal'>Online</p>
                          </div>
                        </div>
                      </div>

                      {/* WhatsApp Chat Area */}
                      <div className='flex-1 p-2 bg-[#ece5dd] overflow-y-auto space-y-2 select-text font-sans'>
                        <div className='p-2 bg-[#dcf8c6] border border-[#d3ecd2] rounded-xl rounded-tr-none text-[8.5px] text-black/80 shadow-sm max-w-[90%] ml-auto space-y-1 relative'>
                          <p className='whitespace-pre-line leading-relaxed'>
                            {waTemplate === 'due_notice' && 
                              "Ciao! 🌟 Ti comunichiamo che la retta per il corso di *Danza Classica* del mese di *Ottobre 2026* è stata emessa.\n\n💰 *Importo*: €55,00\n📅 *Scadenza*: 10/10/2026\n\nPuoi saldarla comodamente online nel tuo Portale Famiglie: https://danceflow.app/parent"
                            }
                            {waTemplate === 'overdue_reminder' && 
                              "⚠️ *Sollecito DanceFlow*: Gentile genitore, ti ricordiamo che la quota di iscrizione annuale risulta *Scaduta*.\n\nSi prega di regolarizzare al più presto per garantire la copertura assicurativa dell'allievo.\n\nSaldatura sicura online: https://danceflow.app/parent"
                            }
                            {waTemplate === 'receipt_sent' && 
                              "✅ *Pagamento Ricevuto*: Grazie! Abbiamo registrato con successo il saldo di *€55,00* per *Retta Classica - Sofia Rossi*.\n\nLa tua ricevuta ufficiale *REC-98273* è disponibile per il download: https://danceflow.app/receipts/REC-98273"
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
                      {staffUsers.map((member) => (
                        <div key={member.uid} className='flex items-center justify-between pt-4 first:pt-0 gap-4'>
                          <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 rounded-full bg-brand-600/30 text-brand-300 border border-brand-500/20 flex items-center justify-center font-bold text-sm'>
                              {member.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className='text-sm font-semibold text-white'>{member.displayName}</p>
                              <p className='text-xs text-white/40'>{member.email}</p>
                            </div>
                          </div>
                          <div className='flex items-center gap-3'>
                            <Badge variant={
                              member.role === 'owner' ? 'brand' : 
                              member.role === 'admin' ? 'gold' : 'teal'
                            }>
                              {member.role === 'owner' ? 'Owner' : 
                               member.role === 'admin' ? 'Admin' : 'Insegnante'}
                            </Badge>
                            
                            {member.role !== 'owner' && (
                              <button
                                onClick={() => handleRemoveStaff(member.uid, member.displayName)}
                                className='p-1.5 text-coral-400 hover:text-coral-300 hover:bg-coral-500/10 rounded-lg transition-colors'
                                title='Rimuovi dallo Staff'
                              >
                                ❌
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
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

            {/* Modal Aggiungi Collaboratore */}
            {isAddStaffOpen && (
              <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up'>
                <Card className='w-full max-w-md p-6 border border-white/10 space-y-4'>
                  <div className='flex justify-between items-center border-b border-white/5 pb-2'>
                    <CardTitle>Invita Collaboratore</CardTitle>
                    <button onClick={() => setIsAddStaffOpen(false)} className='text-white/40 hover:text-white'>
                      ✕
                    </button>
                  </div>

                  {!generatedInviteLink ? (
                    <form onSubmit={handleAddStaff} className='space-y-4'>
                      <Input
                        label='Nome e Cognome'
                        required
                        placeholder='es. Rossella Bianchi'
                        value={staffName}
                        onChange={(e: any) => setStaffName(e.target.value)}
                      />
                      <Input
                        label='Indirizzo Email'
                        type='email'
                        required
                        placeholder='es. rossella@email.it'
                        value={staffEmail}
                        onChange={(e: any) => setStaffEmail(e.target.value)}
                      />
                      <Select
                        label='Ruolo Collaboratore'
                        value={staffRole}
                        onChange={(e: any) => setStaffRole(e.target.value)}
                        options={[
                          { value: 'teacher', label: 'Insegnante' },
                          { value: 'admin', label: 'Amministratore' },
                        ]}
                      />
                      <div className='flex justify-end gap-2 pt-2 border-t border-white/5'>
                        <Button type='button' variant='secondary' onClick={() => setIsAddStaffOpen(false)}>
                          Annulla
                        </Button>
                        <Button type='submit' loading={submittingStaff}>
                          Genera Invito
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className='space-y-4'>
                      <p className='text-sm text-white/70'>
                        Invito generato con successo! Invia questo link di registrazione a <strong>{staffName}</strong>. 
                        Potrà usarlo per completare il suo profilo e impostare la password.
                      </p>
                      
                      <div className='bg-surface-900 border border-white/5 rounded-xl p-3 flex items-center gap-2'>
                        <code className='text-xs text-brand-300 select-all truncate flex-1'>{generatedInviteLink}</code>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            void navigator.clipboard.writeText(generatedInviteLink);
                            toast.success('Link copiato negli appunti!');
                            setCopiedInvite(true);
                          }}
                        >
                          {copiedInvite ? 'Copiato!' : 'Copia'}
                        </Button>
                      </div>

                      <div className='flex justify-end border-t border-white/5 pt-2'>
                        <Button onClick={() => setIsAddStaffOpen(false)}>
                          Chiudi
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
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
