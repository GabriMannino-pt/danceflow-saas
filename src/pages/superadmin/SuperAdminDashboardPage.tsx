import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Button } from '@/components/ui';
import { collection, getDocs, collectionGroup, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Building, Users, Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [totalSchools, setTotalSchools] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);

  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      try {
        // 1. Fetch total schools count
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        setTotalSchools(schoolsSnap.size);

        // 2. Fetch total active students across all schools (collectionGroup)
        const studentsQuery = query(
          collectionGroup(db, 'students'),
          where('isDeleted', '==', false),
          where('isActive', '==', true)
        );
        const studentsSnap = await getDocs(studentsQuery);
        setTotalStudents(studentsSnap.size);
      } catch (err) {
        console.error('[SuperAdminDashboard] Error loading metrics:', err);
        toast.error('Errore nel caricamento delle metriche globali.');
      } finally {
        setLoading(false);
      }
    }

    void loadMetrics();
  }, []);

  return (
    <div className="space-y-6 text-white font-sans text-left">
      <PageHeader
        title="SaaS Cabina di Regia"
        subtitle="Monitoraggio globale e amministrazione tenant del portale DanceFlow."
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-36 glass animate-pulse border border-white/5 bg-white/[0.02]" padding="none">
              <div className="p-6" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Quick Metrics grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 glass border border-white/8 bg-white/[0.02] relative overflow-hidden flex flex-col justify-between h-36 hover:border-brand-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 blur-xl rounded-full -mr-8 -mt-8" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Tenant Attivi</p>
                  <h3 className="text-3xl font-bold font-display mt-2 text-white">{totalSchools}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-300 flex items-center justify-center">
                  <Building size={20} />
                </div>
              </div>
              <p className="text-xs text-white/30">Scuole di danza registrate</p>
            </Card>

            <Card className="p-6 glass border border-white/8 bg-white/[0.02] relative overflow-hidden flex flex-col justify-between h-36 hover:border-teal-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 blur-xl rounded-full -mr-8 -mt-8" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Allievi Totali</p>
                  <h3 className="text-3xl font-bold font-display mt-2 text-teal-400">{totalStudents}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-300 flex items-center justify-center">
                  <Users size={20} />
                </div>
              </div>
              <p className="text-xs text-white/30">Somma allievi attivi nel SaaS</p>
            </Card>

            <Card className="p-6 glass border border-white/8 bg-white/[0.02] relative overflow-hidden flex flex-col justify-between h-36 hover:border-gold-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/5 blur-xl rounded-full -mr-8 -mt-8" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Stato Infrastruttura</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                    </span>
                    <span className="text-sm font-semibold text-teal-300">OPERATIVO</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center">
                  <Activity size={20} />
                </div>
              </div>
              <p className="text-xs text-white/30">Uptime Server: 99.9%</p>
            </Card>
          </div>

          {/* Quick Actions & Navigation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <Card className="p-6 border border-white/8 bg-white/[0.02] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-300 flex items-center justify-center">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-md font-bold text-white">Gestione Scuole e Tenant</h4>
                  <p className="text-xs text-white/50">Elenca e gestisci lo stato di attivazione dei singoli tenant SaaS.</p>
                </div>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Puoi abilitare, sospendere o riattivare istantaneamente le scuole iscritte. In caso di sospensione, tutti gli utenti (inclusi amministratori e genitori) afferenti a quella scuola verranno reindirizzati a una schermata di avviso per mancato pagamento.
              </p>
              <Button
                onClick={() => navigate('/superadmin/schools')}
                className="btn-primary-gradient flex items-center gap-2"
              >
                Vedi Tutte le Scuole
                <ArrowRight size={14} />
              </Button>
            </Card>

            <Card className="p-6 border border-white/8 bg-white/[0.02] flex flex-col justify-between">
              <div>
                <h4 className="text-md font-bold text-white mb-2">Note di Rilascio SaaS</h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  L'infrastruttura è configurata in Multi-Tenancy logica su Firebase Firestore. Le partizioni dei dati sono regolate da Security Rules basate sul campo <code className="text-brand-300">schoolId</code> presente nei documenti utente. Solo gli account con ruolo <code className="text-brand-300">superadmin</code> o flag abilitato hanno accesso alle aggregazioni globali di sistema.
                </p>
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-between text-[11px] text-white/30">
                <span>Versione Piattaforma: v1.0.0</span>
                <span>Configurazione Database: Europe/Rome</span>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
