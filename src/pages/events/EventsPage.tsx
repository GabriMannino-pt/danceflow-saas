import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '@/hooks/useEvents';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Input, Select, Textarea, Button, Badge, Skeleton, EmptyState, Modal, ModalFooter } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Calendar, MapPin, DollarSign, Users, Plus, Filter, Award, ChevronRight, Trash2
} from 'lucide-react';
import { toTimestamp } from '@/lib/converters';
import { formatCurrency } from '@/lib/utils';
import type { Event } from '@/types';

export default function EventsPage() {
  const navigate = useNavigate();
  const { loading, events, createEvent, deleteEvent } = useEvents();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  // Form States per Nuovo Evento
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Event['type']>('show');
  const [startDateStr, setStartDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('');
  const [location, setLocation] = useState('');
  const [fee, setFee] = useState<number>(0);
  const [maxParticipants, setMaxParticipants] = useState<number>(50);
  const isPublic = true;
  const [creating, setCreating] = useState(false);

  // KPI calculations
  const stats = useMemo(() => {
    const active = events.filter((e) => e.status !== 'cancelled').length;
    const participants = events.reduce((sum, e) => sum + (e.participantIds?.length || 0), 0);
    const stages = events.filter((e) => e.type === 'workshop' || e.type === 'exam').length;
    return { active, participants, stages };
  }, [events]);

  // Filtra eventi
  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return events;
    return events.filter((e) => e.type === filterType);
  }, [events, filterType]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDateStr || !location) {
      alert('Compila tutti i campi obbligatori.');
      return;
    }

    setCreating(true);
    try {
      // Combina data e ora in modo robusto
      let dateObj: Date;
      if (startTimeStr) {
        dateObj = new Date(`${startDateStr}T${startTimeStr}`);
      } else {
        dateObj = new Date(`${startDateStr}T00:00`);
      }

      // Se il parsing fallisce su qualche browser, usiamo un fallback basato su split
      if (isNaN(dateObj.getTime())) {
        const [year, month, day] = startDateStr.split('-').map(Number);
        const [hour, minute] = (startTimeStr || '00:00').split(':').map(Number);
        dateObj = new Date(year, month - 1, day, hour || 0, minute || 0);
      }

      await createEvent({
        name,
        description: description || undefined,
        type,
        startDate: toTimestamp(dateObj),
        location: location || undefined,
        fee: fee || undefined,
        maxParticipants: maxParticipants || undefined,
        isPublic,
        status: 'published',
      });

      // Resetta il form e chiudi modal
      setName('');
      setDescription('');
      setStartDateStr('');
      setStartTimeStr('');
      setLocation('');
      setFee(0);
      setMaxParticipants(50);
      setIsModalOpen(false);
    } catch (err) {
      console.error('[EventsPage] Create failed:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita di navigare al dettaglio cliccando elimina
    if (confirm('Sei sicuro di voler eliminare questo evento?')) {
      await deleteEvent(eventId);
    }
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Gestione Eventi'
          subtitle='Organizzazione di saggi, stage di perfezionamento, workshop e competizioni'
          actions={
            <Button icon={<Plus size={16} />} onClick={() => setIsModalOpen(true)}>
              Nuovo Evento
            </Button>
          }
        />

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <StatsCard
            icon={<Calendar className='text-brand-300' size={20} />}
            label='Eventi Programmati'
            value={stats.active}
            sub='Tutti gli eventi attivi'
          />
          <StatsCard
            icon={<Users className='text-teal-400' size={20} />}
            label='Partecipanti Totali'
            value={stats.participants}
            sub='Iscritti complessivi'
          />
          <StatsCard
            icon={<Award className='text-amber-400' size={20} />}
            label='Stage e Workshop'
            value={stats.stages}
            sub='Sessioni di perfezionamento'
          />
        </div>

        {/* ── Filtri di Selezione ────────────────────────────────────────── */}
        <Card className='p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div className='flex items-center gap-2 text-white/50 text-sm'>
            <Filter size={16} />
            <span>Filtra per tipologia:</span>
          </div>
          <div className='flex flex-wrap gap-2'>
            {[
              { value: 'all', label: 'Tutti' },
              { value: 'show', label: 'Saggi' },
              { value: 'competition', label: 'Gare' },
              { value: 'workshop', label: 'Stage / Workshop' },
              { value: 'exam', label: 'Esami' },
              { value: 'party', label: 'Feste / Altro' },
            ].map((t) => (
              <Button
                key={t.value}
                variant={filterType === t.value ? 'primary' : 'secondary'}
                size='xs'
                onClick={() => setFilterType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </Card>

        {/* ── Griglia Eventi ────────────────────────────────────────────── */}
        {loading ? (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {[...Array(3)].map((_, i) => (
              <div key={i} className='glass rounded-2xl p-5 space-y-4'>
                <Skeleton className='h-5 w-40' />
                <Skeleton className='h-3.5 w-full' />
                <Skeleton className='h-8 w-24 rounded-xl' />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon='🎭'
            title='Nessun evento programmato'
            description='Crea subito il tuo primo saggio, stage o workshop cliccando su "Nuovo Evento".'
          />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {filteredEvents.map((event) => {
              const date = event.startDate.toDate();
              return (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className='glass rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all p-5 flex flex-col justify-between cursor-pointer card-hover relative group'
                >
                  <div className='space-y-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <Badge
                        variant={
                          event.type === 'show' ? 'brand' :
                          event.type === 'competition' ? 'coral' :
                          event.type === 'workshop' ? 'teal' : 'gold'
                        }
                        size='sm'
                      >
                        {event.type === 'show' && 'Saggio'}
                        {event.type === 'competition' && 'Gara'}
                        {event.type === 'workshop' && 'Stage'}
                        {event.type === 'exam' && 'Esame'}
                        {event.type === 'party' && 'Festa'}
                        {event.type === 'other' && 'Altro'}
                      </Badge>

                      <div className='flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                        <button
                          onClick={(e) => handleDelete(event.id, e)}
                          className='p-1 rounded-lg text-rose-400 hover:bg-rose-500/10 active:scale-90 transition-all'
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <h3 className='text-base font-bold text-white leading-snug'>{event.name}</h3>

                    {event.description && (
                      <p className='text-xs text-white/50 line-clamp-2'>{event.description}</p>
                    )}

                    <div className='space-y-1.5 text-xs text-white/40 pt-2'>
                      <div className='flex items-center gap-1.5'>
                        <Calendar size={12} />
                        <span>{format(date, 'dd MMMM yyyy HH:mm', { locale: it })}</span>
                      </div>
                      <div className='flex items-center gap-1.5'>
                        <MapPin size={12} />
                        <span className='truncate'>{event.location || 'Sede scuola'}</span>
                      </div>
                    </div>
                  </div>

                  <div className='flex items-center justify-between gap-4 mt-4 pt-3 border-t border-white/5'>
                    <div className='flex items-center gap-3 text-xs text-white/60'>
                      <span className='flex items-center gap-1'>
                        <Users size={12} className='text-teal-400' />
                        {event.participantIds?.length || 0}
                        {event.maxParticipants && `/${event.maxParticipants}`}
                      </span>
                      <span className='flex items-center gap-1'>
                        <DollarSign size={12} className='text-gold-400' />
                        {event.fee ? formatCurrency(event.fee) : 'Gratis'}
                      </span>
                    </div>

                    <ChevronRight size={16} className='text-white/30' />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Modal Nuovo Evento ───────────────────────────────────────── */}
        {isModalOpen && (
          <Modal
            isOpen={true}
            onClose={() => setIsModalOpen(false)}
            title='Organizza Nuovo Evento'
          >
            <form onSubmit={handleCreate} className='space-y-4 py-2'>
              <Input
                label='Nome Evento *'
                placeholder='Es. Saggio di Fine Anno 2026'
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <Select
                  label='Tipologia Evento *'
                  value={type}
                  onChange={(e) => setType(e.target.value as Event['type'])}
                  options={[
                    { value: 'show', label: 'Saggi / Spettacolo' },
                    { value: 'competition', label: 'Gare / Competizione' },
                    { value: 'workshop', label: 'Stage / Workshop' },
                    { value: 'exam', label: 'Esame / Valutazione' },
                    { value: 'party', label: 'Festa / Ritrovo' },
                    { value: 'other', label: 'Altro' },
                  ]}
                />
                <Input
                  type='date'
                  label='Data Inizio *'
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  required
                />
                <Input
                  type='time'
                  label='Ora Inizio (Opzionale)'
                  value={startTimeStr}
                  onChange={(e) => setStartTimeStr(e.target.value)}
                />
              </div>

              <Input
                label='Luogo / Location *'
                placeholder='Es. Teatro Comunale di Roma o Sede'
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Input
                  type='number'
                  label="Quota d'Iscrizione (€)"
                  value={fee.toString()}
                  onChange={(e) => setFee(Number(e.target.value))}
                />
                <Input
                  type='number'
                  label='N. Massimo Partecipanti'
                  value={maxParticipants.toString()}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                />
              </div>

              <Textarea
                label='Descrizione Evento'
                placeholder='Inserisci dettagli sullo spettacolo, sul docente dello stage o sul regolamento...'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <ModalFooter>
                <Button variant='secondary' onClick={() => setIsModalOpen(false)} disabled={creating}>
                  Annulla
                </Button>
                <Button type='submit' loading={creating}>
                  Crea Evento
                </Button>
              </ModalFooter>
            </form>
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatsCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <div className='glass rounded-2xl p-4 border border-white/5 flex flex-col justify-between card-hover'>
      <div className='flex items-center gap-2 text-white/50 mb-1.5'>
        {icon}
        <span className='text-xs font-medium'>{label}</span>
      </div>
      <p className='text-xl font-bold text-white font-display'>{value}</p>
      <p className='text-[10px] text-white/30 mt-1 truncate'>{sub}</p>
    </div>
  );
}
