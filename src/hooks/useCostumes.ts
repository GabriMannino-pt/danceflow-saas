import { useState, useEffect } from 'react';
import {
  collection, doc, query, onSnapshot,
  setDoc, updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { COLLECTIONS, costumeOrderConverter, nowTimestamp } from '@/lib/converters';
import type { CostumeOrder } from '@/types';
import toast from 'react-hot-toast';

export function useCostumes() {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<CostumeOrder[]>([]);

  // Sottoscrizione in tempo reale a tutti gli ordini costumi della scuola
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, COLLECTIONS.costumes(schoolId)).withConverter(costumeOrderConverter)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map((d) => d.data());
      // Ordina per data di creazione decrescente
      fetched.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setOrders(fetched);
      setLoading(false);
    }, (err) => {
      console.error('[useCostumes] Fetch error:', err);
      toast.error('Errore nel caricamento degli ordini costumi.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [schoolId]);

  // ─── Crea Nuovo Ordine Costumi ──────────────────────────────────────────────
  async function createOrder(data: Omit<CostumeOrder, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const orderRef = doc(collection(db, COLLECTIONS.costumes(schoolId))).withConverter(costumeOrderConverter);
      const newOrder: CostumeOrder = {
        ...data,
        id: orderRef.id,
        schoolId,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(orderRef, newOrder);
      toast.success('Ordine costumi registrato con successo!');
      return newOrder;
    } catch (err) {
      console.error('[useCostumes] Create error:', err);
      toast.error('Impossibile registrare l\'ordine.');
      throw err;
    }
  }

  // ─── Aggiorna Stato o Dettagli dell'Ordine ───────────────────────────────────
  async function updateOrderStatus(orderId: string, status: CostumeOrder['status']) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const orderRef = doc(db, COLLECTIONS.costumes(schoolId), orderId).withConverter(costumeOrderConverter);
      await updateDoc(orderRef, {
        status,
        updatedAt: nowTimestamp(),
      });
      toast.success('Stato dell\'ordine aggiornato.');
    } catch (err) {
      console.error('[useCostumes] Update status error:', err);
      toast.error('Impossibile aggiornare lo stato.');
      throw err;
    }
  }

  // ─── Aggiorna Ordine Completo ────────────────────────────────────────────────
  async function updateOrder(orderId: string, updates: Partial<CostumeOrder>) {
    if (!schoolId) throw new Error('Not authenticated');

    try {
      const orderRef = doc(db, COLLECTIONS.costumes(schoolId), orderId).withConverter(costumeOrderConverter);
      await updateDoc(orderRef, {
        ...updates,
        updatedAt: nowTimestamp(),
      });
      toast.success('Ordine costumi aggiornato.');
    } catch (err) {
      console.error('[useCostumes] Update error:', err);
      toast.error('Impossibile aggiornare l\'ordine.');
      throw err;
    }
  }

  return {
    loading,
    orders,
    createOrder,
    updateOrderStatus,
    updateOrder,
  };
}
