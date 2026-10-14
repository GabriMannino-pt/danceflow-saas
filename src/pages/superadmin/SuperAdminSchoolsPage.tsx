import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Badge, Button } from '@/components/ui';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { schoolConverter, nowTimestamp } from '@/lib/converters';
import type { School } from '@/types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Play, Pause, School as SchoolIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SuperAdminSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadSchools() {
    setLoading(true);
    try {
      const q = collection(db, 'schools').withConverter(schoolConverter);
      const snap = await getDocs(q);
      const fetched = snap.docs.map((d) => d.data());
      // Sort by creation date desc
      fetched.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setSchools(fetched);
    } catch (err) {
      console.error('[SuperAdminSchools] Error fetching schools:', err);
      toast.error('Impossibile caricare la lista delle scuole.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchools();
  }, []);

  async function handleToggleSuspension(school: School) {
    setTogglingId(school.id);
    const newSuspendedState = !school.suspended;
    try {
      const ref = doc(db, 'schools', school.id).withConverter(schoolConverter);
      await updateDoc(ref, {
        suspended: newSuspendedState,
        updatedAt: nowTimestamp(),
      });

      // Update local state instantly
      setSchools((prev) =>
        prev.map((s) => (s.id === school.id ? { ...s, suspended: newSuspendedState } : s))
      );

      toast.success(
        newSuspendedState
          ? `Scuola "${school.name}" sospesa con successo!`
          : `Scuola "${school.name}" riattivata con successo!`
      );
    } catch (err) {
      console.error('[SuperAdminSchools] Error toggling school status:', err);
      toast.error("Errore durante l'aggiornamento dello stato della scuola.");
    } finally {
      setTogglingId(null);
    }
  }

  const formatRegDate = (school: School) => {
    if (!school.createdAt) return '—';
    try {
      return format(school.createdAt.toDate(), 'dd MMM yyyy', { locale: it });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6 text-white font-sans text-left">
      <PageHeader
        title="Gestione Scuole e Tenant"
        subtitle="Amministrazione e controllo dei singoli abbonamenti e stati di attivazione."
      />

      <Card className="border border-white/8 bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-white/50">Caricamento scuole in corso...</p>
          </div>
        ) : schools.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <SchoolIcon className="mx-auto text-white/20" size={40} />
            <h3 className="text-sm font-semibold">Nessuna scuola registrata</h3>
            <p className="text-xs text-white/40">Non risultano scuole registrate nel database del SaaS.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.01]">
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase">Scuola / Tenant</th>
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase">Città</th>
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase">Data Reg.</th>
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase">Allievi</th>
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase">Piano</th>
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase">Stato</th>
                  <th className="py-3 px-5 text-xs font-semibold text-white/40 uppercase text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => {
                  const studentCount = school.stats?.activeStudents ?? 0;
                  const planLabel = school.subscription?.plan?.toUpperCase() || 'TRIAL';
                  const isSuspended = school.suspended === true;

                  return (
                    <tr
                      key={school.id}
                      className={`border-b border-white/5 hover:bg-white/[0.01] transition-colors ${
                        isSuspended
                          ? 'opacity-40 bg-red-950/10 grayscale border-l-4 border-red-500'
                          : ''
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div>
                          <p className="text-sm font-semibold text-white">{school.name}</p>
                          <p className="text-[10px] text-white/30 font-mono select-all">{school.id}</p>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-sm text-white/70">
                        {school.address?.city || '—'}
                      </td>
                      <td className="py-4 px-5 text-sm text-white/50">
                        {formatRegDate(school)}
                      </td>
                      <td className="py-4 px-5 text-sm font-semibold text-white">
                        {studentCount}
                      </td>
                      <td className="py-4 px-5">
                        <Badge
                          variant={
                            school.subscription?.plan === 'pro'
                              ? 'teal'
                              : school.subscription?.plan === 'starter'
                              ? 'brand'
                              : 'gold'
                          }
                          size="sm"
                        >
                          {planLabel}
                        </Badge>
                      </td>
                      <td className="py-4 px-5">
                        <Badge variant={isSuspended ? 'danger' : 'success'} size="sm" dot>
                          {isSuspended ? 'Sospeso' : 'Attivo'}
                        </Badge>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <Button
                          size="sm"
                          variant={isSuspended ? 'success' : 'danger'}
                          loading={togglingId === school.id}
                          onClick={() => handleToggleSuspension(school)}
                          icon={isSuspended ? <Play size={12} /> : <Pause size={12} />}
                        >
                          {isSuspended ? 'Attiva' : 'Sospendi'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
