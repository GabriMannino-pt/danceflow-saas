import { useState, useEffect } from 'react';
import {
  collection, doc, query, onSnapshot,
  setDoc, updateDoc, arrayUnion, arrayRemove,
  getDocs, where, writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { COLLECTIONS, eventConverter, paymentConverter, nowTimestamp } from '@/lib/converters';
import type { Event } from '@/types';
import toast from 'react-hot-toast';

export function useEvents() {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);

  // Sottoscrizione in tempo reale agli eventi non eliminati
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, COLLECTIONS.events(schoolId)).withConverter(eventConverter)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs
        .map((d) => d.data())
        .filter((e) => e.isDeleted !== true);
      // Ordina per data di inizio decrescente
      fetched.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());
      setEvents(fetched);
      setLoading(false);
    }, (err) => {
      console.error('[useEvents] Fetch error:', err);
      toast.error('Errore nel caricamento degli eventi.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [schoolId]);

  // ─── Crea Evento ────────────────────────────────────────────────────────────
  async function createEvent(data: Omit<Event, 'id' | 'schoolId' | 'participantIds' | 'createdAt' | 'updatedAt'>) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const eventRef = doc(collection(db, COLLECTIONS.events(schoolId))).withConverter(eventConverter);
      const newEvent: Event = {
        ...data,
        id: eventRef.id,
        schoolId,
        participantIds: [],
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
        isDeleted: false,
      };

      await setDoc(eventRef, newEvent);
      toast.success('Evento creato con successo!');
      return newEvent;
    } catch (err) {
      console.error('[useEvents] Create error:', err);
      toast.error('Errore nella creazione dell\'evento.');
      throw err;
    }
  }

  // ─── Modifica Evento ─────────────────────────────────────────────────────────
  async function editEvent(eventId: string, updates: Partial<Omit<Event, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>>) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const eventRef = doc(db, COLLECTIONS.events(schoolId), eventId).withConverter(eventConverter);
      await updateDoc(eventRef, {
        ...updates,
        updatedAt: nowTimestamp(),
      });

      // Se viene modificata la quota (fee) dell'evento, aggiorna tutti i pagamenti dell'evento retroattivamente
      if (updates.fee !== undefined) {
        const newFee = updates.fee;
        const paymentsQuery = query(
          collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter),
          where('courseId', '==', eventId)
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        
        // Filtriamo e aggiorniamo solo i pagamenti non cancellati e di tipo 'event'
        const batch = writeBatch(db);
        let count = 0;
        
        paymentsSnap.docs.forEach((d) => {
          const payment = d.data();
          if (payment.type === 'event' && payment.status !== 'cancelled') {
            const paid = payment.paidAmount || 0;
            const remaining = Math.max(0, newFee - paid);
            const status = remaining <= 0 ? 'paid' : (paid > 0 ? 'deposit_paid' : 'pending');
            
            batch.update(d.ref, {
              amount: newFee,
              totalAmount: newFee,
              remainingAmount: remaining,
              status,
              updatedAt: nowTimestamp(),
            });
            count++;
          }
        });
        
        if (count > 0) {
          await batch.commit();
          console.log(`[useEvents] Sincronizzati ${count} pagamenti per l'evento con nuova quota di €${newFee}`);
        }
      }

      toast.success('Evento aggiornato con successo.');
    } catch (err) {
      console.error('[useEvents] Edit error:', err);
      toast.error('Impossibile aggiornare l\'evento.');
      throw err;
    }
  }

  // ─── Rimuovi Evento (Soft Delete) ──────────────────────────────────────────
  async function deleteEvent(eventId: string) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const eventRef = doc(db, COLLECTIONS.events(schoolId), eventId).withConverter(eventConverter);
      await updateDoc(eventRef, {
        isDeleted: true,
        deletedAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      });
      toast.success('Evento eliminato con successo.');
    } catch (err) {
      console.error('[useEvents] Delete error:', err);
      toast.error('Impossibile eliminare l\'evento.');
      throw err;
    }
  }

  // ─── Gestione Partecipanti (Aggiungi/Rimuovi) ──────────────────────────────
  async function addParticipant(eventId: string, studentId: string) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const eventRef = doc(db, COLLECTIONS.events(schoolId), eventId).withConverter(eventConverter);
      await updateDoc(eventRef, {
        participantIds: arrayUnion(studentId),
        updatedAt: nowTimestamp(),
      });
      toast.success('Partecipante iscritto all\'evento!');
    } catch (err) {
      console.error('[useEvents] Add participant error:', err);
      toast.error('Impossibile iscrivere il partecipante.');
      throw err;
    }
  }

  async function removeParticipant(eventId: string, studentId: string) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const eventRef = doc(db, COLLECTIONS.events(schoolId), eventId).withConverter(eventConverter);
      await updateDoc(eventRef, {
        participantIds: arrayRemove(studentId),
        updatedAt: nowTimestamp(),
      });
      toast.success('Partecipante rimosso dall\'evento.');
    } catch (err) {
      console.error('[useEvents] Remove participant error:', err);
      toast.error('Impossibile rimuovere il partecipante.');
      throw err;
    }
  }

  return {
    loading,
    events,
    createEvent,
    editEvent,
    deleteEvent,
    addParticipant,
    removeParticipant,
  };
}
