import { useState, useEffect } from 'react';
import {
  collection, doc, query, onSnapshot,
  setDoc, orderBy, limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { COLLECTIONS, messageConverter, notificationConverter, nowTimestamp } from '@/lib/converters';
import type { Message, Notification } from '@/types';
import toast from 'react-hot-toast';

export function useMessages() {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);

  // Sottoscrizione allo storico dei messaggi inviati
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, COLLECTIONS.messages(schoolId)).withConverter(messageConverter),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map((d) => d.data());
      setMessages(fetched);
      setLoading(false);
    }, (err) => {
      console.error('[useMessages] Fetch error:', err);
      toast.error('Errore nel caricamento delle comunicazioni.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [schoolId]);

  // Funzione per inviare un nuovo messaggio/comunicazione
  async function sendMessage(data: {
    subject: string;
    body: string;
    recipientType: Message['recipientType'];
    recipientIds?: string[];
    courseId?: string;
    channels: Array<'app' | 'email' | 'whatsapp'>;
  }) {
    if (!schoolId || !user) throw new Error('Not authenticated');

    try {
      const msgRef = doc(collection(db, COLLECTIONS.messages(schoolId))).withConverter(messageConverter);
      
      const newMessage: Message = {
        id: msgRef.id,
        schoolId,
        subject: data.subject,
        body: data.body,
        authorId: user.uid,
        recipientType: data.recipientType,
        recipientIds: data.recipientIds || undefined,
        courseId: data.courseId || undefined,
        channels: data.channels,
        status: 'sent',
        sentAt: nowTimestamp(),
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(msgRef, newMessage);

      // Se il canale include 'app' (In-App Notification), generiamo la notifica per tutti i destinatari
      if (data.channels.includes('app')) {
        let targetUserIds: string[] = [];

        if (data.recipientType === 'all') {
          // In produzione si otterrebbero tutti i genitori/allievi della scuola
          // In questo prototipo simuliamo o mandiamo all'autore stesso per test
          targetUserIds = [user.uid];
        } else if (data.recipientType === 'students' && data.recipientIds) {
          targetUserIds = data.recipientIds;
        }

        // Crea i record di notifica per ciascun utente in users/{userId}/notifications
        for (const targetId of targetUserIds) {
          const notifRef = doc(collection(db, COLLECTIONS.notifications(targetId))).withConverter(notificationConverter);
          const newNotif: Notification = {
            id: notifRef.id,
            userId: targetId,
            schoolId,
            title: `📢 Nuova Comunicazione: ${data.subject}`,
            body: data.body.length > 100 ? `${data.body.substring(0, 100)}...` : data.body,
            type: 'message',
            isRead: false,
            createdAt: nowTimestamp(),
            updatedAt: nowTimestamp(),
          };
          await setDoc(notifRef, newNotif);
        }
      }

      toast.success('Comunicazione inviata con successo!');
      return newMessage;
    } catch (err) {
      console.error('[useMessages] Send communication failed:', err);
      toast.error('Errore durante l\'invio della comunicazione.');
      throw err;
    }
  }

  return {
    loading,
    messages,
    sendMessage,
  };
}
