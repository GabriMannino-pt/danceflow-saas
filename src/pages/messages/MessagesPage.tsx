import { useState, useMemo } from 'react';
import { useSchoolStore } from '@/stores/schoolStore';
import { useMessages } from '@/hooks/useMessages';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Select, Input, Textarea, Button, Badge, Skeleton, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Send, MessageSquare, Mail
} from 'lucide-react';
import type { Message } from '@/types';

export default function MessagesPage() {
  const students = useSchoolStore((s) => s.students);
  const courses = useSchoolStore((s) => s.courses);

  const activeCourses = useMemo(() =>
    courses.filter((c) => c.isActive && !c.isDeleted),
  [courses]);

  const activeStudents = useMemo(() =>
    students.filter((st) => st.isActive && !st.isDeleted),
  [students]);

  const {
    loading,
    messages,
    sendMessage
  } = useMessages();

  // Form states
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientType, setRecipientType] = useState<Message['recipientType']>('all');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [channelApp, setChannelApp] = useState(true);
  const [channelEmail, setChannelEmail] = useState(false);
  const [sending, setSending] = useState(false);

  // Filtra allievi per selezione singola/multipla
  const studentOptions = useMemo(() => {
    return activeStudents.map((s) => ({
      value: s.id,
      label: `${s.firstName} ${s.lastName}`,
    }));
  }, [activeStudents]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !body) {
      alert('Inserisci un oggetto e un corpo del messaggio.');
      return;
    }

    const channels: Message['channels'] = [];
    if (channelApp) channels.push('app');
    if (channelEmail) channels.push('email');

    if (channels.length === 0) {
      alert('Seleziona almeno un canale di invio (Notifica In-App o Email).');
      return;
    }

    setSending(true);
    try {
      let recipientIds: string[] | undefined;
      if (recipientType === 'students' && selectedStudentId) {
        recipientIds = [selectedStudentId];
      }

      await sendMessage({
        subject,
        body,
        recipientType,
        recipientIds,
        courseId: recipientType === 'course' ? selectedCourseId : undefined,
        channels,
      });

      // Pulisci il form dopo l'invio
      setSubject('');
      setBody('');
      setSelectedCourseId('');
      setSelectedStudentId('');
    } catch (err) {
      console.error('[MessagesPage] Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Comunicazioni & Notifiche'
          subtitle='Invia messaggi in bacheca ed e-mail ad allievi e genitori'
        />

        <div className='grid grid-cols-1 lg:grid-cols-5 gap-6'>
          {/* ── Form Invio Messaggio ──────────────────────────────────────── */}
          <div className='lg:col-span-3'>
            <Card>
              <CardTitle className='mb-4 flex items-center gap-2'>
                <Send size={18} className='text-brand-300' />
                Nuova Comunicazione
              </CardTitle>

              <form onSubmit={handleSend} className='space-y-4'>
                <Select
                  label='Destinatari'
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as Message['recipientType'])}
                  options={[
                    { value: 'all', label: 'Tutti gli allievi e genitori' },
                    { value: 'course', label: 'Tutti gli allievi di un corso' },
                    { value: 'students', label: 'Un allievo specifico' },
                  ]}
                />

                {recipientType === 'course' && (
                  <Select
                    label='Seleziona Corso'
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    options={[
                      { value: '', label: 'Scegli un corso...' },
                      ...activeCourses.map((c) => ({ value: c.id, label: c.name }))
                    ]}
                    required
                  />
                )}

                {recipientType === 'students' && (
                  <Select
                    label='Seleziona Allievo'
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    options={[
                      { value: '', label: 'Scegli un allievo...' },
                      ...studentOptions
                    ]}
                    required
                  />
                )}

                {/* Selezione Canali */}
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-white/70 block'>Canali di Invio</label>
                  <div className='flex items-center gap-6 glass p-3 rounded-xl border border-white/5'>
                    <label className='flex items-center gap-2 text-sm text-white/80 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={channelApp}
                        onChange={(e) => setChannelApp(e.target.checked)}
                        className='rounded border-white/20 text-brand-500 focus:ring-brand-500/30'
                      />
                      <MessageSquare size={16} className='text-teal-400' />
                      Bacheca In-App
                    </label>
                    <label className='flex items-center gap-2 text-sm text-white/80 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={channelEmail}
                        onChange={(e) => setChannelEmail(e.target.checked)}
                        className='rounded border-white/20 text-brand-500 focus:ring-brand-500/30'
                      />
                      <Mail size={16} className='text-amber-400' />
                      E-mail diretta
                    </label>
                  </div>
                </div>

                <Input
                  label='Oggetto del Messaggio'
                  placeholder='Es. Chiusura straordinaria scuola per maltempo'
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />

                <Textarea
                  label='Corpo del Messaggio'
                  placeholder='Scrivi qui la tua comunicazione per esteso...'
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />

                <Button
                  type='submit'
                  loading={sending}
                  className='w-full'
                >
                  Invia Comunicazione
                </Button>
              </form>
            </Card>
          </div>

          {/* ── Storico Messaggi Inviati ──────────────────────────────────── */}
          <div className='lg:col-span-2'>
            <Card className='h-full flex flex-col'>
              <CardTitle className='mb-4'>Storico Invii</CardTitle>

              {loading ? (
                <div className='space-y-4 flex-1'>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className='space-y-2 p-3 rounded-2xl glass'>
                      <Skeleton className='h-4 w-32' />
                      <Skeleton className='h-3.5 w-full' />
                      <Skeleton className='h-3.5 w-20' />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  icon='✉️'
                  title='Nessun messaggio inviato'
                  description='Tutte le comunicazioni future appariranno in questo registro.'
                />
              ) : (
                <div className='space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-1'>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className='p-3 rounded-2xl glass border border-white/5 hover:bg-white/5 transition-all space-y-2'
                    >
                      <div className='flex items-start justify-between gap-2'>
                        <p className='text-sm font-semibold text-white truncate'>{msg.subject}</p>
                        <Badge
                          variant={msg.status === 'sent' ? 'success' : 'danger'}
                          size='sm'
                        >
                          {msg.status === 'sent' ? 'Inviato' : 'Bozza'}
                        </Badge>
                      </div>

                      <p className='text-xs text-white/50 line-clamp-2'>{msg.body}</p>

                      {/* Info canali e destinatari */}
                      <div className='flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[10px] text-white/40'>
                        <div className='flex items-center gap-1.5'>
                          {msg.channels.includes('app') && (
                            <span className='flex items-center gap-0.5 text-teal-400'>
                              <MessageSquare size={10} /> App
                            </span>
                          )}
                          {msg.channels.includes('email') && (
                            <span className='flex items-center gap-0.5 text-amber-400'>
                              <Mail size={10} /> Email
                            </span>
                          )}
                        </div>

                        <span>
                          {format(msg.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: it })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
