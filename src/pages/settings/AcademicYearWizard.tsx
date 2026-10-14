import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/converters';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAcademicYear } from '@/hooks/useAcademicYear';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, Button, Input, Modal } from '@/components/ui';
import {
  Calendar,
  Lock,
  Download,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Info,
  ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AcademicYearWizard() {
  const navigate = useNavigate();
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const { transitioning, progress, performAcademicYearTransition } = useAcademicYear();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [bypassLock, setBypassLock] = useState(false);

  // Step 1 states
  const [checklist, setChecklist] = useState({
    staffNotified: false,
    paymentsReviewed: false,
    irreversibleAccepted: false,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  // Step 2 states
  const [nextYear, setNextYear] = useState('');

  // Step 3 states
  const [confirmInput, setConfirmInput] = useState('');
  const [isDone, setIsDone] = useState(false);

  // Determine current calendar window lock (June 1st to September 30th)
  const isWithinWindow = useMemo(() => {
    const month = new Date().getMonth(); // 0-indexed, 5 = June, 8 = September
    return month >= 5 && month <= 8;
  }, []);

  const isLocked = !isWithinWindow && !bypassLock;

  // Auto-generate next logical academic year
  useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    // E.g. in 2026, suggest "2026/2027"
    setNextYear(`${currentYear}/${currentYear + 1}`);
  }, []);

  // GDPR Backup exporter
  const handleExportBackup = async () => {
    if (!activeSchool) return;

    setIsExporting(true);
    const toastId = toast.loading("Esportazione del backup di sicurezza in corso...");

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
      const fileName = `danceflow_backup_pre_reset_${activeSchool.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${dateStr}.json`;
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setBackupDownloaded(true);
      toast.success("Backup scaricato con successo!", { id: toastId });
    } catch (err: any) {
      console.error('[AcademicYearWizard] Backup failure:', err);
      toast.error("Impossibile generare il backup. Riprova più tardi.", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const requiredConfirmText = `Conferma Reset ${activeSchool?.name || 'Tropical Style'}`;

  // Execute transition
  const handleExecuteTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;
    if (confirmInput.trim() !== requiredConfirmText) {
      toast.error('La frase di conferma inserita non corrisponde.');
      return;
    }

    try {
      await performAcademicYearTransition(nextYear.trim());
      setIsDone(true);
    } catch (err) {
      // toast is triggered inside performAcademicYearTransition
    }
  };

  const step1Valid = checklist.staffNotified && checklist.paymentsReviewed && checklist.irreversibleAccepted && backupDownloaded;
  const step2Valid = nextYear.trim().length > 0 && /^\d{4}\/\d{4}$/.test(nextYear.trim());
  const step3Valid = confirmInput.trim() === requiredConfirmText;

  if (!activeSchool) {
    return (
      <div className="p-8 text-center text-white/50">
        Caricamento dati scuola in corso...
      </div>
    );
  }

  // locked state display
  if (isLocked) {
    return (
      <div className="space-y-6 max-w-lg mx-auto pt-10 px-4 text-center">
        <Card className="border border-coral-500/20 bg-coral-950/5 p-6 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-coral-500/10 text-coral-400 flex items-center justify-center mx-auto shadow-lg">
            <Lock size={32} className="animate-pulse" />
          </div>
          <h2 className="text-xl font-bold font-display text-coral-300">Cambio Anno Bloccato</h2>
          <p className="text-sm text-white/70 leading-relaxed">
            La procedura di passaggio d'anno accademico comporta l'archiviazione di massa dei corsi e lo sfoltimento delle iscrizioni attuali.
            Per prevenire perdite accidentali di dati durante i periodi di lezioni attive, questa operazione è consentita **solamente tra il 1° Giugno e il 30 Settembre**.
          </p>
          <div className="p-3 bg-white/5 rounded-xl text-left flex gap-2 text-xs text-white/50">
            <Calendar size={16} className="text-brand-300 flex-shrink-0 mt-0.5" />
            <span>Puoi pianificare la transizione durante il periodo estivo prima della ripresa della nuova stagione accademica.</span>
          </div>

          <div className="pt-4 flex flex-col gap-2">
            <Button variant="secondary" onClick={() => navigate('/settings')} className="w-full">
              Torna alle Impostazioni
            </Button>
            <button
              onClick={() => setBypassLock(true)}
              className="text-[10px] text-white/20 hover:text-white/40 underline font-medium transition-colors mt-2"
            >
              Bypassa blocco temporale (Sviluppatore)
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto px-4 pb-16">
      <PageHeader
        title="Cambio Anno Accademico"
        subtitle="Chiudi la stagione attuale e prepara il database per i nuovi inserimenti"
      />

      {/* Stepper Status Bar */}
      {!isDone && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { step: 1, label: "Backup & Checklist" },
            { step: 2, label: "Battesimo Anno" },
            { step: 3, label: "Conferma" },
          ].map((s) => (
            <div
              key={s.step}
              className={`p-3 rounded-xl border text-xs font-semibold transition-all ${
                currentStep === s.step
                  ? 'bg-brand-600/20 text-brand-300 border-brand-500'
                  : currentStep > s.step
                  ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                  : 'glass border-white/5 text-white/40'
              }`}
            >
              <div className="flex justify-center items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  currentStep === s.step
                    ? 'bg-brand-500 text-white'
                    : currentStep > s.step
                    ? 'bg-teal-500 text-white'
                    : 'bg-white/10 text-white/50'
                }`}>
                  {s.step}
                </span>
                <span>{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isDone ? (
        <Card className="border border-teal-500/20 bg-teal-950/5 p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 size={36} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold font-display text-teal-300">Transizione Completata!</h2>
            <p className="text-sm text-white/70 leading-relaxed max-w-md mx-auto">
              L'anno accademico è stato chiuso correttamente. Tutti i corsi precedenti sono stati archiviati ed è stato azzerato l'elenco dei corsi per gli allievi attivi, impostando il loro stato a <strong>"Da Rinnovare"</strong>.
            </p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl max-w-sm mx-auto text-left space-y-2 text-xs text-white/60">
            <div className="flex gap-2 items-center text-teal-300 font-bold">
              <ShieldCheck size={14} /> Dati Tutelati & Conservati:
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>I certificati medici e le relative scadenze sono rimasti intatti.</li>
              <li>Tutte le firme digitali e i contratti storici rimangono legati alle anagrafiche allievi.</li>
              <li>I corsi vecchi sono consultabili in modalità archivio.</li>
            </ul>
          </div>
          <Button variant="primary" onClick={() => navigate('/dashboard')} className="btn-primary-gradient px-8">
            Vai alla Console Dashboard
          </Button>
        </Card>
      ) : (
        <Card className="glass border border-white/10 overflow-hidden shadow-xl">
          <CardBody className="p-6 space-y-6">
            
            {/* STEP 1: CONSENT & BACKUP */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <Info className="text-brand-400" size={18} /> Step 1: Checklist di Sicurezza e Backup GDPR
                  </h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Prima di procedere con il reset del database, è obbligatorio verificare la conformità amministrativa ed effettuare un backup completo dei dati per consentire un eventuale ripristino.
                  </p>
                </div>

                {/* Checkbox List */}
                <div className="space-y-3 p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checklist.staffNotified}
                      onChange={(e) => setChecklist({ ...checklist, staffNotified: e.target.checked })}
                      className="mt-1 rounded bg-white/5 border-white/20 text-brand-500 focus:ring-brand-500/50"
                    />
                    <span className="text-xs text-white/70 group-hover:text-white transition-colors">
                      Ho avvisato il personale e i docenti della chiusura delle lezioni e dei registri presenze.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checklist.paymentsReviewed}
                      onChange={(e) => setChecklist({ ...checklist, paymentsReviewed: e.target.checked })}
                      className="mt-1 rounded bg-white/5 border-white/20 text-brand-500 focus:ring-brand-500/50"
                    />
                    <span className="text-xs text-white/70 group-hover:text-white transition-colors">
                      Ho verificato che tutte le scadenze e i pagamenti dell'anno corrente siano stati incassati o contabilizzati.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checklist.irreversibleAccepted}
                      onChange={(e) => setChecklist({ ...checklist, irreversibleAccepted: e.target.checked })}
                      className="mt-1 rounded bg-white/5 border-white/20 text-brand-500 focus:ring-brand-500/50"
                    />
                    <span className="text-xs text-white/70 group-hover:text-white transition-colors">
                      Comprendo che la rimozione dell'allievo dai corsi attivi è un'operazione irreversibile nel database.
                    </span>
                  </label>
                </div>

                {/* Backup Generation Section */}
                <div className="p-5 rounded-2xl border border-brand-500/20 bg-brand-950/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="text-xs font-bold text-brand-300">Esportazione Preventiva dei Dati</h4>
                    <p className="text-[11px] text-white/50 leading-relaxed max-w-sm">
                      Scarica un file JSON completo contenente anagrafiche, storico corsi, pagamenti e presenze per scopi legali, di archivio o audit.
                    </p>
                  </div>
                  <Button
                    onClick={handleExportBackup}
                    disabled={isExporting}
                    icon={<Download size={14} />}
                    className={`whitespace-nowrap ${backupDownloaded ? 'bg-teal-500/20 text-teal-300 hover:bg-teal-500/30' : 'btn-primary-gradient'}`}
                  >
                    {isExporting ? 'Esportazione...' : backupDownloaded ? 'Backup Scaricato ✓' : 'Scarica Backup JSON'}
                  </Button>
                </div>

                {!backupDownloaded && (
                  <div className="flex gap-2 items-center justify-center p-3 rounded-xl bg-gold-500/10 border border-gold-500/20 text-[10px] text-gold-300 font-medium">
                    <AlertTriangle size={14} />
                    <span>Devi scaricare il backup di sicurezza prima di poter avanzare al prossimo step.</span>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: BATTESIMO NUOVO ANNO */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <Calendar className="text-brand-400" size={18} /> Step 2: Configura il Nome del Nuovo Anno
                  </h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Definisci il nome identificativo per la prossima stagione accademica. Questo valore verrà utilizzato come etichetta temporale per i nuovi corsi che andrai a creare.
                  </p>
                </div>

                <div className="max-w-sm space-y-4">
                  <div>
                    <Input
                      label="Nuovo Anno Accademico"
                      placeholder="Es. 2026/2027"
                      value={nextYear}
                      onChange={(e) => setNextYear(e.target.value)}
                      required
                    />
                    <p className="text-[11px] text-white/40 mt-1">
                      Inserisci il formato standard AAAA/AAAA (es. 2026/2027)
                    </p>
                  </div>

                  {nextYear.trim() && !/^\d{4}\/\d{4}$/.test(nextYear.trim()) && (
                    <div className="text-[10px] text-coral-400 font-semibold italic flex items-center gap-1.5">
                      <AlertTriangle size={12} /> Formato suggerito: AAAA/AAAA (Es. 2026/2027)
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 space-y-2.5 text-xs text-white/60">
                  <p className="font-semibold text-white/70">Cosa avverrà dopo la conferma?</p>
                  <ul className="list-disc pl-4 space-y-1.5">
                    <li>Tutti i corsi attuali (con anno accademico corrente) verranno impostati come <span className="text-brand-300">archiviati</span>.</li>
                    <li>Gli allievi iscritti saranno sfoltiti dai corsi per permettere nuove programmazioni di lezioni.</li>
                    <li>Potrai iniziare subito a creare i corsi sotto l'anno accademico appena definito.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* STEP 3: CONFERMA E RESET */}
            {currentStep === 3 && (
              <form onSubmit={handleExecuteTransition} className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="text-coral-400" size={18} /> Step 3: Conferma Esecuzione Irreversibile
                  </h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Hai completato la checklist, scaricato il backup ed impostato il nuovo anno <strong>{nextYear}</strong>. Digita la frase di conferma per abilitare l'esecuzione definitiva.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-coral-500/20 bg-coral-950/10 space-y-2">
                  <p className="text-xs text-coral-300 font-bold">Attenzione: Questa azione è irreversibile!</p>
                  <p className="text-[11px] text-white/70 leading-relaxed">
                    Tropical Style disiscriverà in massa tutti gli allievi e archivierà i corsi in corso. I dati dello storico allievi verranno aggiornati con le frequenze di quest'anno e i pagamenti complessivi eseguiti.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-white/70">
                    Per confermare, digita esattamente: <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded border border-white/10 select-all">{requiredConfirmText}</span>
                  </label>
                  <Input
                    placeholder={requiredConfirmText}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    required
                    disabled={transitioning}
                  />
                </div>
              </form>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-white/5">
              <Button
                variant="secondary"
                disabled={currentStep === 1 || transitioning}
                onClick={() => setCurrentStep((prev) => prev - 1)}
                icon={<ChevronLeft size={16} />}
              >
                Indietro
              </Button>

              {currentStep < 3 ? (
                <Button
                  variant="primary"
                  className="btn-primary-gradient"
                  disabled={currentStep === 1 ? !step1Valid : !step2Valid}
                  onClick={() => setCurrentStep((prev) => prev + 1)}
                  iconRight={<ChevronRight size={16} />}
                >
                  Avanti
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={handleExecuteTransition}
                  disabled={!step3Valid || transitioning}
                  icon={<RefreshCw size={14} className={transitioning ? 'animate-spin' : ''} />}
                >
                  Avvia Cambio Anno
                </Button>
              )}
            </div>

          </CardBody>
        </Card>
      )}

      {/* FULL-SCREEN LOADING MODAL DURING TRANSITION */}
      <Modal
        isOpen={transitioning}
        onClose={() => {}} // Non-closable during active write actions
        title="Esecuzione Chiusura Anno Accademico"
        description="Non chiudere questa finestra e non ricaricare la pagina. Elaborazione in corso..."
      >
        <div className="py-6 space-y-4 text-center">
          <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-400 rounded-full animate-spin mx-auto" />
          
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">
              Migrazione e archiviazione dati...
            </p>
            <p className="text-xs text-white/50">
              Operazione {progress.current} di {progress.total} completate
            </p>
          </div>

          {/* Custom progress bar */}
          {progress.total > 0 && (
            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full btn-primary-gradient transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
}
