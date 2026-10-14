import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui';
import { FileText, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const schoolId = searchParams.get('schoolId');
  const [schoolName, setSchoolName] = useState('Tropical Style');

  useEffect(() => {
    if (!schoolId) return;
    async function fetchSchool() {
      try {
        const docRef = doc(db, 'schools', schoolId!);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSchoolName(docSnap.data().name || 'Tropical Style');
        }
      } catch (err) {
        console.error('Error fetching school name:', err);
      }
    }
    void fetchSchool();
  }, [schoolId]);

  return (
    <div className="min-h-screen bg-[#0F0A1E] text-slate-200 py-12 px-4 font-sans leading-relaxed">
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-semibold text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Torna indietro</span>
        </button>

        <Card className="p-8 border border-white/5 bg-surface-900 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Termini di Servizio</h1>
              <p className="text-xs text-white/40">Condizioni generali di iscrizione e partecipazione ai corsi</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <p>
              Benvenuto nel portale di iscrizione. I presenti Termini di Servizio disciplinano l'iscrizione e la partecipazione ai corsi e alle attività organizzate da <strong className="text-white font-semibold">{schoolName}</strong> (di seguito la "Scuola").
            </p>

            <h2 className="text-base font-bold text-white pt-2">1. Richiesta di Iscrizione e Approvazione</h2>
            <p>
              L'iscrizione ai corsi avviene tramite la compilazione e l'invio del modulo digitale. L'invio della richiesta costituisce proposta di adesione ed è soggetto ad approvazione finale da parte della segreteria della Scuola. All'approvazione, l'utente riceverà una notifica via email e potrà accedere al portale dedicato.
            </p>

            <h2 className="text-base font-bold text-white pt-2">2. Firma Elettronica Semplice (FES)</h2>
            <p>
              La sottoscrizione del modulo avviene tramite l'apposizione di una firma digitale autografa su schermo. L'utente accetta che tale modalità di firma, associata alla registrazione automatica dei metadati di sicurezza (quali data/ora, indirizzo IP e hash crittografico SHA-256 dei dati inseriti), costituisca espressione valida ed efficace del consenso ai sensi delle normative vigenti (Firma Elettronica Semplice).
            </p>

            <h2 className="text-base font-bold text-white pt-2">3. Obbligo di Certificazione Medica</h2>
            <p>
              Tutti gli allievi iscritti ai corsi pratici hanno l'obbligo tassativo di presentare alla segreteria un certificato medico di idoneità all'attività sportiva (non agonistica o agonistica) in corso di validità. In assenza di un certificato medico valido, la Scuola si riserva il diritto di sospendere l'allievo dalle lezioni pratiche per tutelarne la salute e per conformità assicurativa.
            </p>

            <h2 className="text-base font-bold text-white pt-2">4. Quote di Iscrizione e Pagamenti</h2>
            <p>
              Le quote di partecipazione ai corsi devono essere versate entro le scadenze stabilite dalla Scuola. La quota di iscrizione annuale non è rimborsabile in caso di ritiro dell'allievo. I pagamenti possono essere registrati in segreteria (contanti, pos, bonifico) o effettuati online ove abilitato.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
