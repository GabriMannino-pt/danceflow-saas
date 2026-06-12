import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  CreditCard,
  Calendar,
  MessageSquare,
  ClipboardCheck,
  Info,
  X,
  CheckSquare
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

interface NotificationBellProps {
  collapsed?: boolean;
}

export function NotificationBell({ collapsed = false }: NotificationBellProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useNotifications();

  // Map notification type to Lucide icons & color schemes
  const getTypeConfig = (type: Notification['type']) => {
    switch (type) {
      case 'payment_due':
      case 'payment_reminder':
        return {
          icon: <CreditCard className="w-4 h-4 text-coral-400" />,
          bg: 'bg-coral-500/10 border-coral-500/20',
        };
      case 'event':
        return {
          icon: <Calendar className="w-4 h-4 text-brand-400" />,
          bg: 'bg-brand-500/10 border-brand-500/20',
        };
      case 'message':
        return {
          icon: <MessageSquare className="w-4 h-4 text-emerald-400" />,
          bg: 'bg-emerald-500/10 border-emerald-500/20',
        };
      case 'attendance':
        return {
          icon: <ClipboardCheck className="w-4 h-4 text-amber-400" />,
          bg: 'bg-amber-500/10 border-amber-500/20',
        };
      case 'system':
      default:
        return {
          icon: <Info className="w-4 h-4 text-sky-400" />,
          bg: 'bg-sky-500/10 border-sky-500/20',
        };
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.isRead) {
      await markAsRead(notif.id);
    }
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
    setIsOpen(false);
  };

  const formatNotificationTime = (createdAt: any) => {
    if (!createdAt) return '';
    try {
      // If it is a Firestore Timestamp
      const date = typeof createdAt.toDate === 'function' ? createdAt.toDate() : new Date(createdAt);
      return formatDistanceToNow(date, { addSuffix: true, locale: it });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-xl transition-all duration-200 hover:bg-white/5 group",
          isOpen ? "text-white bg-white/10" : "text-white/60 hover:text-white"
        )}
        title="Notifiche"
        aria-label="Apri notifiche"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 text-brand-400 animate-pulse" />
        ) : (
          <Bell className="w-5 h-5 group-hover:scale-105 transition-transform" />
        )}
        
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 transform translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full bg-coral-500 text-[9px] font-bold text-white shadow-md shadow-coral-950/50">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop for click outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Dropdown Panel - uses fixed positioning to bypass parent overflow restrictions */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 w-[340px] max-h-[460px] flex flex-col rounded-2xl border border-white/10 bg-surface-950/95 backdrop-blur-xl shadow-2xl transition-all duration-300 ease-out",
            "bottom-16 md:bottom-4",
            collapsed ? "left-16 ml-3" : "left-60 ml-3"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/5">
            <div>
              <h3 className="font-semibold text-white text-sm">Notifiche</h3>
              <p className="text-xs text-white/40">
                {unreadCount > 0
                  ? `${unreadCount} da leggere`
                  : 'Nessuna nuova notifica'}
              </p>
            </div>
            
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-brand-300 hover:text-brand-200 hover:bg-brand-500/10 transition-all"
                title="Segna tutte come lette"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Leggi tutto</span>
              </button>
            )}
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-[340px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-white/40 space-y-2">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Caricamento...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-white/40 px-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                  <Bell className="w-5 h-5 text-white/20" />
                </div>
                <p className="text-xs font-medium text-white/60">Tutto aggiornato!</p>
                <p className="text-[11px] text-white/30 mt-0.5">Non ci sono notifiche al momento.</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const config = getTypeConfig(notif.type);
                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "group relative flex gap-3 p-3 rounded-xl border border-transparent transition-all duration-200",
                      "hover:bg-white/5 hover:border-white/5",
                      !notif.isRead ? "bg-brand-500/[0.03] border-brand-500/10" : ""
                    )}
                  >
                    {/* Read indicator dot */}
                    {!notif.isRead && (
                      <span className="absolute top-3.5 right-3 w-1.5 h-1.5 rounded-full bg-brand-500" />
                    )}

                    {/* Icon container */}
                    <div
                      onClick={() => handleNotificationClick(notif)}
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 cursor-pointer",
                        config.bg
                      )}
                    >
                      {config.icon}
                    </div>

                    {/* Text content */}
                    <div
                      onClick={() => handleNotificationClick(notif)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <p className={cn(
                        "text-xs leading-tight truncate pr-4",
                        !notif.isRead ? "font-semibold text-white" : "font-normal text-white/70"
                      )}>
                        {notif.title}
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                      <span className="text-[9px] text-white/30 mt-1 block">
                        {formatNotificationTime(notif.createdAt)}
                      </span>
                    </div>

                    {/* Dismiss Button */}
                    <button
                      onClick={() => removeNotification(notif.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-all self-start ml-auto"
                      title="Elimina notifica"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
