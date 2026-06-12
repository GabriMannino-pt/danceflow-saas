import { useState, useMemo } from 'react';
import { useCostumes } from '@/hooks/useCostumes';
import { useEvents } from '@/hooks/useEvents';
import { useSchoolStore } from '@/stores/schoolStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Select, Input, Textarea, Button, Badge, Skeleton, EmptyState, Modal, ModalFooter } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { format } from 'date-fns';
import {
  Plus, Users, DollarSign, Download, Eye
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { computeCostumeSize } from '@/pages/students/StudentDetailPage';
import jsPDF from 'jspdf';
import type { CostumeOrder, CostumeItem } from '@/types';

export default function CostumeOrdersPage() {
  const { loading: ordersLoading, orders, createOrder, updateOrderStatus } = useCostumes();
  const { events } = useEvents();
  const students = useSchoolStore((s) => s.students);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CostumeOrder | null>(null);

  // Form States per Nuovo Ordine
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [eventId, setEventId] = useState('');
  const [unitCost, setUnitCost] = useState<number>(35);
  const [creating, setCreating] = useState(false);

  // Calcola allievi iscritti all'evento per pre-compilare l'ordine
  const selectedEventParticipants = useMemo(() => {
    if (!eventId) return [];
    const event = events.find((e) => e.id === eventId);
    if (!event || !event.participantIds) return [];
    return students.filter((s) => event.participantIds.includes(s.id));
  }, [eventId, events, students]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !supplier || !eventId) {
      alert('Compila tutti i campi obbligatori.');
      return;
    }

    if (selectedEventParticipants.length === 0) {
      alert('L\'evento selezionato non ha ancora nessun allievo iscritto. Iscrivi prima gli allievi dall\'evento.');
      return;
    }

    setCreating(true);
    try {
      // Prepara i singoli capi per l'ordine recuperando le misure di ciascun allievo
      const items: CostumeItem[] = selectedEventParticipants.map((student) => {
        const m = student.costumes;
        const calculatedSize = m ? computeCostumeSize(m.chest, m.waist, m.hips) : undefined;
        return {
          studentId: student.id,
          description: `Costume per ${student.firstName} ${student.lastName}`,
          size: calculatedSize || 'M', // M come taglia di fallback
          measurements: m || undefined,
          quantity: 1,
          unitCost,
        };
      });

      const totalCost = items.reduce((sum, item) => sum + (item.unitCost || 0) * item.quantity, 0);

      await createOrder({
        name,
        description: description || undefined,
        supplier: supplier || undefined,
        eventId: eventId || undefined,
        items,
        status: 'draft',
        totalCost,
      });

      setName('');
      setDescription('');
      setSupplier('');
      setEventId('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('[CostumeOrdersPage] Create failed:', err);
    } finally {
      setCreating(false);
    }
  };

  // ─── Generazione PDF Sartoria ───────────────────────────────────────────────
  const generateSartoriaPDF = (order: CostumeOrder) => {
    const doc = new jsPDF();
    const event = events.find((e) => e.id === order.eventId);

    // Titolo e Intestazione
    doc.setFillColor(26, 26, 36);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('Helvetica', 'bold');
    doc.text('DANCEFLOW - ORDINE SARTORIA', 15, 18);
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Generato il: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, 28);

    // Dati Ordine
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('Dettagli Commessa:', 15, 52);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Ordine: ${order.name}`, 15, 60);
    doc.text(`Fornitore / Sartoria: ${order.supplier || '—'}`, 15, 67);
    doc.text(`Evento Collegato: ${event?.name || '—'}`, 15, 74);
    doc.text(`Capi Totali: ${order.items?.length || 0} costumi`, 15, 81);

    // Tabella delle Misure
    doc.setFont('Helvetica', 'bold');
    doc.text('Registro Misure Allievi:', 15, 95);

    let y = 105;
    // Disegna intestazione tabella
    doc.setFillColor(240, 240, 245);
    doc.rect(15, y - 5, 180, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.text('Allievo', 17, y);
    doc.text('Taglia', 65, y);
    doc.text('Altezza', 85, y);
    doc.text('Seno', 110, y);
    doc.text('Vita', 135, y);
    doc.text('Fianchi', 160, y);
    doc.text('Scarpa', 182, y);

    y += 8;

    order.items?.forEach((item) => {
      // Paginazione automatica
      if (y > 270) {
        doc.addPage();
        y = 25;
        // Ristampa intestazione tabella
        doc.setFillColor(240, 240, 245);
        doc.rect(15, y - 5, 180, 8, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.text('Allievo', 17, y);
        doc.text('Taglia', 65, y);
        doc.text('Altezza', 85, y);
        doc.text('Seno', 110, y);
        doc.text('Vita', 135, y);
        doc.text('Fianchi', 160, y);
        doc.text('Scarpa', 182, y);
        y += 8;
      }

      const student = students.find((s) => s.id === item.studentId);
      const name = student ? `${student.firstName} ${student.lastName}` : '—';
      const m = item.measurements;

      doc.setFont('Helvetica', 'normal');
      doc.text(name.substring(0, 24), 17, y);
      doc.text(item.size || '—', 67, y);
      doc.text(m?.height ? `${m.height} cm` : '—', 85, y);
      doc.text(m?.chest ? `${m.chest} cm` : '—', 110, y);
      doc.text(m?.waist ? `${m.waist} cm` : '—', 135, y);
      doc.text(m?.hips ? `${m.hips} cm` : '—', 160, y);
      doc.text(m?.shoeSize ? `${m.shoeSize}` : '—', 184, y);

      y += 8;
    });

    // Conteggio Riepilogo Taglie in fondo
    const sizeCounts: Record<string, number> = {};
    order.items?.forEach((item) => {
      const s = item.size || 'Da misurare';
      sizeCounts[s] = (sizeCounts[s] || 0) + 1;
    });

    if (y > 240) {
      doc.addPage();
      y = 25;
    }

    y += 10;
    doc.setFillColor(245, 245, 250);
    doc.rect(15, y, 180, 20, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.text('RIEPILOGO TAGLIE DA CONFEZIONARE:', 18, y + 7);
    doc.setFont('Helvetica', 'normal');
    
    const summaryStr = Object.entries(sizeCounts)
      .map(([size, count]) => `${size}: ${count} pz`)
      .join('   |   ');
    doc.text(summaryStr, 18, y + 14);

    doc.save(`ordine_sartoria_${order.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`);
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Gestione Costumi & Sartoria'
          subtitle='Ordini di produzione per spettacoli con calcolo taglie automatico e PDF sartoria'
          actions={
            <Button icon={<Plus size={16} />} onClick={() => setIsModalOpen(true)}>
              Nuovo Ordine
            </Button>
          }
        />

        {/* ── Elenco Ordini Costumi ────────────────────────────────────── */}
        {ordersLoading ? (
          <div className='space-y-4'>
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className='h-24 w-full rounded-2xl' />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon='📐'
            title='Nessun ordine costumi'
            description='Registra subito il tuo primo ordine legandolo a un saggio o a una gara.'
          />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            {orders.map((order) => {
              const event = events.find((e) => e.id === order.eventId);
              return (
                <Card key={order.id} className='p-5 border border-white/5 flex flex-col justify-between hover:border-white/10 transition-all'>
                  <div className='space-y-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <Badge
                        variant={
                          order.status === 'distributed' ? 'success' :
                          order.status === 'received' ? 'teal' :
                          order.status === 'ordered' ? 'warning' : 'gray'
                        }
                        size='sm'
                      >
                        {order.status === 'draft' && 'In lavorazione (Bozza)'}
                        {order.status === 'ordered' && 'Ordinato in Sartoria'}
                        {order.status === 'received' && 'Ricevuto a Scuola'}
                        {order.status === 'distributed' && 'Distribuito agli allievi'}
                      </Badge>
                      
                      <span className='text-xs text-white/30'>
                        {format(order.createdAt.toDate(), 'dd/MM/yyyy')}
                      </span>
                    </div>

                    <h3 className='text-base font-bold text-white'>{order.name}</h3>
                    {order.description && <p className='text-xs text-white/50'>{order.description}</p>}

                    <div className='grid grid-cols-2 gap-2 text-xs text-white/40 pt-2'>
                      <div>Sartoria: <span className='text-white/80 font-medium'>{order.supplier || '—'}</span></div>
                      <div>Spettacolo: <span className='text-white/80 font-medium'>{event?.name || '—'}</span></div>
                    </div>
                  </div>

                  <div className='flex items-center justify-between gap-4 mt-6 pt-3 border-t border-white/5'>
                    <div className='flex gap-2 text-xs text-white/60 items-center'>
                      <span className='flex items-center gap-1'><Users size={12} /> {order.items?.length || 0} capi</span>
                      <span>·</span>
                      <span className='flex items-center gap-0.5'><DollarSign size={12} /> {formatCurrency(order.totalCost || 0)}</span>
                    </div>

                    <div className='flex gap-2'>
                      <Button
                        variant='outline'
                        size='xs'
                        icon={<Download size={12} />}
                        onClick={() => generateSartoriaPDF(order)}
                      >
                        PDF Sartoria
                      </Button>
                      <Button
                        variant='secondary'
                        size='xs'
                        icon={<Eye size={12} />}
                        onClick={() => setSelectedOrder(order)}
                      >
                        Dettagli
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Modal Nuovo Ordine ───────────────────────────────────────── */}
        {isModalOpen && (
          <Modal
            isOpen={true}
            onClose={() => setIsModalOpen(false)}
            title='Nuovo Ordine Costumi'
          >
            <form onSubmit={handleCreate} className='space-y-4 py-2'>
              <Input
                label="Nome dell'Ordine *"
                placeholder="Es. Costumi Lago dei Cigni classica"
                value={name}
                onChange={(e: any) => setName(e.target.value)}
                required
              />

              <Input
                label="Fornitore / Sartoria *"
                placeholder="Es. Sartoria Danza D'Angelo"
                value={supplier}
                onChange={(e: any) => setSupplier(e.target.value)}
                required
              />

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Select
                  label='Spettacolo / Evento Collegato *'
                  value={eventId}
                  onChange={(e: any) => setEventId(e.target.value)}
                  options={[
                    { value: '', label: 'Seleziona un evento...' },
                    ...events.map((e) => ({ value: e.id, label: e.name }))
                  ]}
                  required
                />
                <Input
                  type='number'
                  label='Costo Unitario Costume (€) *'
                  value={unitCost.toString()}
                  onChange={(e: any) => setUnitCost(Number(e.target.value))}
                  required
                />
              </div>

              {eventId && (
                <div className='p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300'>
                  Verranno estratti automaticamente gli allievi iscritti all'evento selezionato ({selectedEventParticipants.length} allievi trovati).
                </div>
              )}

              <Textarea
                label='Descrizione ed Istruzioni'
                placeholder='Dettagli particolari sul modello, tessuti o personalizzazioni da inviare alla sartoria...'
                value={description}
                onChange={(e: any) => setDescription(e.target.value)}
              />

              <ModalFooter>
                <Button variant='secondary' onClick={() => setIsModalOpen(false)} disabled={creating}>
                  Annulla
                </Button>
                <Button type='submit' loading={creating}>
                  Crea Ordine
                </Button>
              </ModalFooter>
            </form>
          </Modal>
        )}

        {/* ── Modal Dettaglio Ordine ───────────────────────────────────── */}
        {selectedOrder && (
          <Modal
            isOpen={true}
            onClose={() => setSelectedOrder(null)}
            title={`Ordine: ${selectedOrder.name}`}
          >
            <div className='space-y-4 py-2 max-h-[420px] overflow-y-auto pr-1'>
              <div className='grid grid-cols-2 gap-4 text-xs text-white/60 p-3 bg-white/5 rounded-xl'>
                <div>Fornitore: <span className='text-white font-medium'>{selectedOrder.supplier || '—'}</span></div>
                <div>Totale: <span className='text-white font-medium'>{formatCurrency(selectedOrder.totalCost || 0)}</span></div>
                <div>Stato:
                  <span className='text-white font-medium block mt-1'>
                    <Select
                      value={selectedOrder.status}
                      onChange={(e: any) => updateOrderStatus(selectedOrder.id, e.target.value as CostumeOrder['status'])}
                      options={[
                        { value: 'draft', label: 'Bozza' },
                        { value: 'ordered', label: 'Ordinato' },
                        { value: 'received', label: 'Ricevuto' },
                        { value: 'distributed', label: 'Distribuito' },
                      ]}
                    />
                  </span>
                </div>
              </div>

              <div className='space-y-2'>
                <h4 className='text-sm font-semibold text-brand-300'>Ripartizione Capi & Misure:</h4>
                {selectedOrder.items?.map((item, idx) => {
                  const student = students.find((s) => s.id === item.studentId);
                  return (
                    <div key={idx} className='flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs'>
                      <div>
                        <p className='font-bold text-white'>{student ? `${student.firstName} ${student.lastName}` : '—'}</p>
                        <p className='text-white/40 mt-0.5'>
                          {item.measurements
                            ? `Alt: ${item.measurements.height}cm · Seno: ${item.measurements.chest}cm · Vita: ${item.measurements.waist}cm · Fianchi: ${item.measurements.hips}cm`
                            : 'Misure non inserite'}
                        </p>
                      </div>
                      <Badge variant='brand'>{item.size}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <ModalFooter>
              <Button onClick={() => setSelectedOrder(null)}>Chiudi</Button>
            </ModalFooter>
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
}
