import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui';
import { Shield, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
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
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Informativa Privacy</h1>
              <p className="text-xs text-white/40">Ai sensi del Regolamento UE 2016/679 (GDPR)</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <p>
              La presente Informativa sulla Privacy descrive le modalità con cui i dati personali vengono raccolti, utilizzati e protetti. La scuola di danza <strong className="text-white font-semibold">{schoolName}</strong> (di seguito "Titolare") è Titolare del Trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR).
            </p>

            <h2 className="text-base font-bold text-white pt-2">1. Tipologia di Dati Trattati</h2>
            <p>
              Il Titolare tratta i dati personali forniti in fase di iscrizione, tra cui:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dati identificativi e di contatto del genitore/referente (Nome, Cognome, Codice Fiscale, Email, Telefono, Residenza).</li>
              <li>Dati anagrafici dell'allievo (Nome, Cognome, Data di nascita, Codice Fiscale, Sesso).</li>
              <li>Dati particolari e sanitari (informazioni sullo stato di salute e certificato medico di idoneità sportiva non agonistica/agonistica).</li>
              <li>Immagini fotografiche e riprese video acquisite durante spettacoli, saggi, saggi di fine anno o lezioni (previa liberatoria).</li>
            </ul>

            <h2 className="text-base font-bold text-white pt-2">2. Finalità del Trattamento</h2>
            <p>
              I dati personali vengono raccolti e trattati esclusivamente per le seguenti finalità:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Organizzazione ed erogazione dei corsi di danza e delle attività didattiche collegate.</li>
              <li>Adempimenti di obblighi di legge, amministrativi, contabili e fiscali (es. emissione ricevute di pagamento).</li>
              <li>Attivazione delle coperture assicurative obbligatorie ed iscrizione presso enti di promozione sportiva o federazioni.</li>
              <li>Divulgazione e promozione delle attività istituzionali della scuola attraverso canali web, social network o brochure cartacee.</li>
            </ul>

            <h2 className="text-base font-bold text-white pt-2">3. Conservazione dei Dati</h2>
            <p>
              I dati amministrativi e di iscrizione saranno conservati per i tempi previsti dalle normative fiscali e di legge (10 anni). I dati sanitari e i certificati medici caricati sul sistema verranno conservati esclusivamente per la durata del loro periodo di validità o dell'anno accademico corrente, dopodiché verranno definitivamente eliminati o resi anonimi.
            </p>

            <h2 className="text-base font-bold text-white pt-2">4. Diritti dell'Interessato</h2>
            <p>
              In ogni momento, l'utente può esercitare i propri diritti ai sensi degli artt. 15-22 del GDPR, inviando una comunicazione scritta al Titolare. I diritti includono l'accesso ai propri dati, la rettifica, la cancellazione (diritto all'oblio), la limitazione del trattamento e l'opposizione al trattamento per scopi promozionali.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
