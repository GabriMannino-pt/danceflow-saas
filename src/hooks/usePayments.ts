import { useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  onSnapshot,
  writeBatch,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { paymentConverter, COLLECTIONS, nowTimestamp, toTimestamp, removeUndefined } from '@/lib/converters';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import type { Payment, PaymentMethod } from '@/types';
import { getNextReceiptNumber } from '@/services/receiptService';
import toast from 'react-hot-toast';

export function usePayments() {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const {
    payments,
    setPayments,
    setLoadingPayments,
    students,
    courses,
  } = useSchoolStore();

  // ─── Real-time Subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || user?.role === 'teacher') {
      setPayments([]);
      setLoadingPayments(false);
      return;
    }

    setLoadingPayments(true);

    const q = query(collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => d.data());
        // Sort by dueDate descending
        fetched.sort((a, b) => b.dueDate.toMillis() - a.dueDate.toMillis());
        setPayments(fetched);
      },
      (error) => {
        console.error('[usePayments] onSnapshot error:', error);
        toast.error('Errore durante la sincronizzazione dei pagamenti.');
        setLoadingPayments(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [schoolId, setPayments, setLoadingPayments]);

  // ─── Create Single Payment ──────────────────────────────────────────────────
  async function createPayment(data: Omit<Payment, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const paymentRef = doc(collection(db, COLLECTIONS.payments(schoolId))).withConverter(paymentConverter);
      
      const student = students.find((s) => s.id === data.studentId);
      const parentId = data.parentId || student?.parentId;
      
      const newPayment: Payment = {
        ...data,
        id: paymentRef.id,
        schoolId,
        ...(parentId ? { parentId } : {}),
        totalAmount: data.amount,
        paidAmount: 0,
        remainingAmount: data.amount,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(paymentRef, newPayment);
      toast.success('Pagamento addebitato con successo!');
      return newPayment;
    } catch (err) {
      console.error('[usePayments] create error:', err);
      toast.error('Errore durante la registrazione del pagamento.');
      throw err;
    }
  }

  // ─── Mark As Paid (Saldato interamente) ──────────────────────────────────────
  async function markAsPaid(paymentId: string, method: PaymentMethod, generateReceipt: boolean, notes?: string) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Payment not found');
      const p = snap.data();

      const total = p.totalAmount ?? p.amount;
      const unpaid = p.remainingAmount ?? (p.status === 'paid' ? 0 : total);
      
      if (unpaid <= 0) {
        toast.error('Il pagamento è già stato interamente saldato.');
        return;
      }

      return await registerInstallment(paymentId, unpaid, method, new Date(), notes || '', generateReceipt);
    } catch (err) {
      console.error('[usePayments] markAsPaid error:', err);
      toast.error('Impossibile aggiornare lo stato del pagamento.');
      throw err;
    }
  }

  // ─── Registra Versamento Parziale / Acconto / Saldo ──────────────────────────
  async function registerInstallment(
    paymentId: string,
    installmentAmount: number,
    method: PaymentMethod,
    date: Date,
    notes: string,
    emitReceipt: boolean
  ) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Payment not found');
      const p = snap.data();

      const student = students.find((s) => s.id === p.studentId);
      const course = courses.find((c) => c.id === p.courseId);
      
      const isMonthly = p.type === 'monthly';
      const hasCustomFee = student && student.customMonthlyFee !== undefined && student.customMonthlyFee !== null;
      
      const totalAmount = p.totalAmount ?? p.amount ?? (
        isMonthly && hasCustomFee
          ? student.customMonthlyFee!
          : (isMonthly && course?.fee?.monthly)
            ? course.fee.monthly
            : 0
      );

      const prevPaid = p.paidAmount ?? 0;
      const newPaid = prevPaid + installmentAmount;
      const remainingAmount = Math.max(0, totalAmount - newPaid);

      let status: Payment['status'] = 'pending';
      if (newPaid >= totalAmount) {
        status = 'paid';
      } else if (newPaid > 0) {
        status = 'deposit_paid';
      }

      let receiptNumber = p.receiptNumber;
      if (emitReceipt && !receiptNumber) {
        receiptNumber = await getNextReceiptNumber(schoolId);
      }

      const newInstallment = {
        amount: installmentAmount,
        date: Timestamp.fromDate(date),
        method,
        receiptEmitted: emitReceipt,
        receiptUrl: emitReceipt && receiptNumber ? `generated://receipt/${receiptNumber}` : undefined,
        notes: notes || undefined
      };

      const history = p.payments ? [...p.payments, newInstallment] : [newInstallment];

      const updates: Partial<Payment> = {
        totalAmount,
        paidAmount: newPaid,
        remainingAmount,
        status,
        payments: history,
        updatedAt: nowTimestamp(),
      };

      if (status === 'paid') {
        updates.paidAt = nowTimestamp();
        updates.method = method;
      }
      if (receiptNumber) {
        updates.receiptNumber = receiptNumber;
        updates.receiptURL = `generated://receipt/${receiptNumber}`;
        if (emitReceipt) {
          newInstallment.receiptUrl = `generated://receipt/${receiptNumber}`;
        }
      }

      await updateDoc(ref, removeUndefined(updates));
      toast.success(status === 'paid' ? 'Pagamento saldato!' : 'Acconto registrato con successo!');
      return { updates: { ...p, ...updates }, newInstallment };
    } catch (err) {
      console.error('[usePayments] registerInstallment error:', err);
      toast.error('Errore durante la registrazione del versamento.');
      throw err;
    }
  }

  // ─── Generate Monthly Fees ──────────────────────────────────────────────────
  async function generateMonthlyFees(courseId: string, month: number, year: number, dueDate: Date) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    
    const course = courses.find((c) => c.id === courseId);
    if (!course) {
      toast.error('Corso non trovato.');
      return;
    }

    if (!course.fee?.monthly || course.fee.monthly <= 0) {
      toast.error('Il corso selezionato non ha una retta mensile configurata.');
      return;
    }

    const enrolledActiveStudents = students.filter(
      (s) => s.enrolledCourseIds?.includes(courseId) && s.isActive && !s.isDeleted
    );

    if (enrolledActiveStudents.length === 0) {
      toast.error('Nessun allievo attivo iscritto a questo corso.');
      return;
    }

    try {
      const batch = writeBatch(db);
      const paymentsCol = collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter);
      let count = 0;

      for (const student of enrolledActiveStudents) {
        // Check if payment already exists for this month/year/course/student
        const existing = payments.find(
          (p) => p.studentId === student.id && 
                 p.courseId === courseId && 
                 p.month === month && 
                 p.year === year &&
                 p.type === 'monthly'
        );

        if (!existing) {
          const feeVal = (student.customMonthlyFee !== undefined && student.customMonthlyFee !== null)
             ? student.customMonthlyFee
             : course.fee.monthly;

          const newRef = doc(paymentsCol);
          const newPayment: Payment = {
            id: newRef.id,
            schoolId,
            studentId: student.id,
            ...(student.parentId ? { parentId: student.parentId } : {}),
            courseId: course.id,
            description: `Retta ${course.name} - ${month}/${year}`,
            amount: feeVal,
            currency: 'EUR',
            status: 'pending',
            dueDate: toTimestamp(dueDate),
            type: 'monthly',
            month,
            year,
            totalAmount: feeVal,
            paidAmount: 0,
            remainingAmount: feeVal,
            createdAt: nowTimestamp(),
            updatedAt: nowTimestamp(),
          };
          batch.set(newRef, newPayment);
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
        toast.success(`Generate ${count} quote mensili con successo!`);
      } else {
        toast.success('Le quote per questo mese erano già state generate.');
      }
    } catch (err) {
      console.error('[usePayments] generateMonthlyFees error:', err);
      toast.error('Errore durante la generazione delle quote.');
      throw err;
    }
  }

  // ─── Modifica Versamento ───────────────────────────────────────────────────
  async function updateInstallment(
    paymentId: string,
    index: number,
    updatedInstallment: { amount: number; date: Date; method: PaymentMethod; notes: string }
  ) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Payment not found');
      const p = snap.data();

      if (!p.payments || !p.payments[index]) throw new Error('Installment not found');

      const history = [...p.payments];
      const prevInst = history[index];
      
      history[index] = {
        ...prevInst,
        amount: updatedInstallment.amount,
        date: Timestamp.fromDate(updatedInstallment.date),
        method: updatedInstallment.method,
        notes: updatedInstallment.notes || undefined,
      };

      // Recalculate amounts
      const student = students.find((s) => s.id === p.studentId);
      const course = courses.find((c) => c.id === p.courseId);
      
      const isMonthly = p.type === 'monthly';
      const hasCustomFee = student && student.customMonthlyFee !== undefined && student.customMonthlyFee !== null;
      
      const totalAmount = (isMonthly && hasCustomFee)
        ? student.customMonthlyFee!
        : (isMonthly && course?.fee?.monthly)
          ? course.fee.monthly
          : (p.totalAmount ?? p.amount);

      const newPaid = history.reduce((sum, inst) => sum + inst.amount, 0);
      const remainingAmount = Math.max(0, totalAmount - newPaid);

      let status: Payment['status'] = 'pending';
      if (newPaid >= totalAmount) {
        status = 'paid';
      } else if (newPaid > 0) {
        status = 'deposit_paid';
      }

      const updates: Partial<Payment> = {
        paidAmount: newPaid,
        remainingAmount,
        status,
        payments: history,
        updatedAt: nowTimestamp(),
      };

      if (status === 'paid') {
        updates.paidAt = nowTimestamp();
        updates.method = updatedInstallment.method;
      } else {
        updates.paidAt = undefined;
      }

      await updateDoc(ref, removeUndefined(updates));
      toast.success('Versamento aggiornato con successo!');
    } catch (err) {
      console.error('[usePayments] updateInstallment error:', err);
      toast.error('Errore durante la modifica del versamento.');
      throw err;
    }
  }

  // ─── Elimina Versamento ────────────────────────────────────────────────────
  async function deleteInstallment(paymentId: string, index: number) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Payment not found');
      const p = snap.data();

      if (!p.payments || !p.payments[index]) throw new Error('Installment not found');

      const history = p.payments.filter((_, idx) => idx !== index);

      // Recalculate amounts
      const student = students.find((s) => s.id === p.studentId);
      const course = courses.find((c) => c.id === p.courseId);
      
      const isMonthly = p.type === 'monthly';
      const hasCustomFee = student && student.customMonthlyFee !== undefined && student.customMonthlyFee !== null;
      
      const totalAmount = (isMonthly && hasCustomFee)
        ? student.customMonthlyFee!
        : (isMonthly && course?.fee?.monthly)
          ? course.fee.monthly
          : (p.totalAmount ?? p.amount);

      const newPaid = history.reduce((sum, inst) => sum + inst.amount, 0);
      const remainingAmount = Math.max(0, totalAmount - newPaid);

      let status: Payment['status'] = 'pending';
      if (newPaid >= totalAmount) {
        status = 'paid';
      } else if (newPaid > 0) {
        status = 'deposit_paid';
      }

      const updates: Partial<Payment> = {
        paidAmount: newPaid,
        remainingAmount,
        status,
        payments: history,
        updatedAt: nowTimestamp(),
      };

      if (status === 'paid') {
        updates.paidAt = nowTimestamp();
      } else {
        updates.paidAt = undefined;
      }

      await updateDoc(ref, removeUndefined(updates));
      toast.success('Versamento eliminato con successo!');
    } catch (err) {
      console.error('[usePayments] deleteInstallment error:', err);
      toast.error('Errore durante l\'eliminazione del versamento.');
      throw err;
    }
  }

  // ─── Emetti Ricevuta Postuma ───────────────────────────────────────────────
  async function emitInstallmentReceipt(paymentId: string, index: number) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Payment not found');
      const p = snap.data();

      if (!p.payments || !p.payments[index]) throw new Error('Installment not found');

      const history = [...p.payments];
      const inst = history[index];

      if (inst.receiptEmitted) {
        toast.error('Ricevuta già emessa per questo versamento.');
        return;
      }

      const receiptNumber = p.receiptNumber || (await getNextReceiptNumber(schoolId));
      const receiptUrl = `generated://receipt/${receiptNumber}`;

      history[index] = {
        ...inst,
        receiptEmitted: true,
        receiptUrl,
      };

      const updates: Partial<Payment> = {
        payments: history,
        updatedAt: nowTimestamp(),
      };

      if (!p.receiptNumber) {
        updates.receiptNumber = receiptNumber;
        updates.receiptURL = receiptUrl;
      }

      await updateDoc(ref, removeUndefined(updates));
      toast.success('Ricevuta emessa con successo!');
      return { updates: { ...p, ...updates }, newInstallment: history[index] };
    } catch (err) {
      console.error('[usePayments] emitInstallmentReceipt error:', err);
      toast.error('Errore durante l\'emissione della ricevuta.');
      throw err;
    }
  }

  // ─── Annulla Quota ─────────────────────────────────────────────────────────
  async function cancelPayment(paymentId: string, reason: string) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      const updates: Partial<Payment> = {
        status: 'cancelled',
        notes: reason,
        updatedAt: nowTimestamp(),
      };

      await updateDoc(ref, removeUndefined(updates));
      toast.success('Quota annullata con successo!');
    } catch (err) {
      console.error('[usePayments] cancelPayment error:', err);
      toast.error('Errore durante l\'annullamento della quota.');
      throw err;
    }
  }

  // ─── Elimina Pagamento Fisicamente ─────────────────────────────────────────
  async function deletePayment(paymentId: string) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), paymentId).withConverter(paymentConverter);
      await deleteDoc(ref);
      toast.success('Pagamento eliminato con successo!');
    } catch (err) {
      console.error('[usePayments] deletePayment error:', err);
      toast.error('Errore durante l\'eliminazione del pagamento.');
      throw err;
    }
  }

  // ─── Direct Instant Payment (Registration / Monthly with dynamic custom amount) ───
  async function registerDirectPayment(data: {
    studentId: string;
    courseId?: string;
    type: 'monthly' | 'registration';
    month?: number;
    year?: number;
    description: string;
    amount: number;
    method: PaymentMethod;
    date: Date;
    notes?: string;
    emitReceipt: boolean;
  }) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const student = students.find((s) => s.id === data.studentId);
      const parentId = student?.parentId;

      let receiptNumber: string | undefined = undefined;
      if (data.emitReceipt) {
        receiptNumber = await getNextReceiptNumber(schoolId);
      }

      const paymentRef = doc(collection(db, COLLECTIONS.payments(schoolId))).withConverter(paymentConverter);
      const timestampDate = Timestamp.fromDate(data.date);

      const installment = {
        amount: data.amount,
        date: timestampDate,
        method: data.method,
        receiptEmitted: data.emitReceipt,
        receiptUrl: receiptNumber ? `generated://receipt/${receiptNumber}` : undefined,
        notes: data.notes || undefined,
      };

      const newPayment: Payment = {
        id: paymentRef.id,
        schoolId,
        studentId: data.studentId,
        ...(parentId ? { parentId } : {}),
        courseId: data.courseId || undefined,
        type: data.type,
        month: data.month,
        year: data.year || new Date().getFullYear(),
        description: data.description.trim(),
        amount: data.amount,
        totalAmount: data.amount,
        paidAmount: data.amount,
        remainingAmount: 0,
        currency: 'EUR',
        status: 'paid',
        paidAt: timestampDate,
        dueDate: timestampDate,
        method: data.method,
        receiptNumber,
        notes: data.notes?.trim() || undefined,
        payments: [installment],
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(paymentRef, newPayment);

      // If registration fee, update student
      if (data.type === 'registration') {
        const studentRef = doc(db, COLLECTIONS.students(schoolId), data.studentId);
        await updateDoc(studentRef, {
          registrationFeePaid: true,
          registrationFeePaidAt: timestampDate,
          updatedAt: nowTimestamp(),
        });
      }

      toast.success(
        receiptNumber 
          ? `Pagamento di €${data.amount.toFixed(2)} registrato! (Ricevuta n. ${receiptNumber})`
          : `Pagamento di €${data.amount.toFixed(2)} registrato con successo!`
      );
      return { payment: newPayment, installment };
    } catch (err: any) {
      console.error('[usePayments] registerDirectPayment error:', err);
      toast.error('Errore durante la registrazione del pagamento.');
      throw err;
    }
  }

  return {
    payments,
    createPayment,
    markAsPaid,
    registerInstallment,
    registerDirectPayment,
    generateMonthlyFees,
    updateInstallment,
    deleteInstallment,
    emitInstallmentReceipt,
    cancelPayment,
    deletePayment,
  };
}
