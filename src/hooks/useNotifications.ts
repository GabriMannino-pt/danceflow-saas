import { useEffect, useState } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { COLLECTIONS, notificationConverter } from '@/lib/converters';
import type { Notification } from '@/types';

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notifRef = collection(db, COLLECTIONS.notifications(user.uid)).withConverter(notificationConverter);
    const q = query(notifRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => d.data());
        setNotifications(fetched);
        setLoading(false);
      },
      (err) => {
        console.error('[useNotifications] Error fetching notifications:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAsRead = async (notificationId: string) => {
    if (!user?.uid) return;
    try {
      const ref = doc(db, COLLECTIONS.notifications(user.uid), notificationId);
      await updateDoc(ref, { isRead: true });
    } catch (err) {
      console.error('[useNotifications] markAsRead error:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.uid || unreadCount === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (!n.isRead) {
          const ref = doc(db, COLLECTIONS.notifications(user.uid), n.id);
          batch.update(ref, { isRead: true });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error('[useNotifications] markAllAsRead error:', err);
    }
  };

  const removeNotification = async (notificationId: string) => {
    if (!user?.uid) return;
    try {
      const ref = doc(db, COLLECTIONS.notifications(user.uid), notificationId);
      await deleteDoc(ref);
    } catch (err) {
      console.error('[useNotifications] removeNotification error:', err);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    removeNotification,
  };
}
