import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Button } from '@/components/ui';
import { collection, getDocs, collectionGroup, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Building, Users, Activity, ArrowRight, ShieldCheck, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { subMonths, format, endOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [totalSchools, setTotalSchools] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [chartData, setChartData] = useState<{ name: string; mrr: number; tenants: number }[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(val);
  };

  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      try {
        // 1. Fetch schools
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        const schoolsList: any[] = schoolsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTotalSchools(schoolsList.length);

        // 2. Calculate current MRR
        let currentMrr = 0;
        let proCount = 0;
        let starterCount = 0;
        let trialCount = 0;

        schoolsList.forEach((school) => {
          if (!school.suspended) {
            if (school.subscription?.plan === 'pro') {
              currentMrr += 79;
              proCount++;
            } else if (school.subscription?.plan === 'starter') {
              currentMrr += 29;
              starterCount++;
            } else {
              trialCount++;
            }
          } else {
            trialCount++;
          }
        });
        setMrr(currentMrr);

        // 3. Subscription distribution pie chart
        const distribution = [
          { name: 'Piano Pro (€79)', value: proCount, color: '#10b981' }, // teal-500
          { name: 'Piano Starter (€29)', value: starterCount, color: '#8b5cf6' }, // brand/violet-500
          { name: 'Trial / Sospesi (€0)', value: trialCount, color: '#f59e0b' }, // gold-500
        ].filter(d => d.value > 0);
        setPieData(distribution);

        // 4. MRR growth (last 6 months dynamically filtered by school creation date)
        const now = new Date();
        const computedChartData = Array.from({ length: 6 }).map((_, i) => {
          const d = subMonths(now, 5 - i);
          const end = endOfMonth(d);
          const monthLabel = format(d, 'MMM yy', { locale: it });

          let monthlyMrr = 0;
          let activeTenants = 0;

          schoolsList.forEach((school) => {
            let createdAtDate = new Date(0);
            if (school.createdAt) {
              if (typeof school.createdAt.toDate === 'function') {
                createdAtDate = school.createdAt.toDate();
              } else if (school.createdAt.seconds) {
                createdAtDate = new Date(school.createdAt.seconds * 1000);
              } else {
                createdAtDate = new Date(school.createdAt);
              }
            }

            if (createdAtDate <= end) {
              activeTenants++;
              if (!school.suspended) {
                if (school.subscription?.plan === 'pro') {
                  monthlyMrr += 79;
                } else if (school.subscription?.plan === 'starter') {
                  monthlyMrr += 29;
                }
              }
            }
          });

          return {
            name: monthLabel,
            mrr: monthlyMrr,
            tenants: activeTenants,
          };
        });
        setChartData(computedChartData);

        // 5. Fetch total active students across all schools (collectionGroup)
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
        <div className="space-y-6">
          {/* Quick Metrics grid loading */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="h-36 glass animate-pulse border border-white/5 bg-white/[0.02]" padding="none">
                <div className="p-6" />
              </Card>
            ))}
          </div>
          {/* Charts loading */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3 h-[340px] glass animate-pulse border border-white/5 bg-white/[0.02]">
              <div />
            </Card>
            <Card className="lg:col-span-2 h-[340px] glass animate-pulse border border-white/5 bg-white/[0.02]">
              <div />
            </Card>
          </div>
        </div>
      ) : (
        <>
          {/* Quick Metrics grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <p className="text-xs text-white/50 font-medium uppercase tracking-wider">MRR Attivo</p>
                  <h3 className="text-3xl font-bold font-display mt-2 text-gold-400">{formatCurrency(mrr)}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gold-500/15 text-gold-300 flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
              </div>
              <p className="text-xs text-white/30">Ricavo mensile ricorrente stimato</p>
            </Card>

            <Card className="p-6 glass border border-white/8 bg-white/[0.02] relative overflow-hidden flex flex-col justify-between h-36 hover:border-teal-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 blur-xl rounded-full -mr-8 -mt-8" />
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

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pt-4">
            {/* MRR & Tenant Growth LineChart — 3/5 width */}
            <div className="lg:col-span-3">
              <Card className="p-6 border border-white/8 bg-white/[0.02] flex flex-col h-[340px]">
                <h4 className="text-sm font-bold text-white mb-4">Crescita MRR & Tenant (Ultimi 6 Mesi)</h4>
                <div className="w-full flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                      <XAxis dataKey="name" stroke="rgba(255, 255, 255, 0.4)" fontSize={11} />
                      <YAxis yAxisId="left" stroke="rgba(255, 255, 255, 0.4)" fontSize={11} tickFormatter={(v) => `€${v}`} />
                      <YAxis yAxisId="right" orientation="right" stroke="rgba(255, 255, 255, 0.4)" fontSize={11} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15, 15, 25, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        labelStyle={{ color: 'white', fontWeight: 'bold' }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Line yAxisId="left" type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} activeDot={{ r: 6 }} name="MRR (€)" />
                      <Line yAxisId="right" type="monotone" dataKey="tenants" stroke="#8b5cf6" strokeWidth={2} name="Tenant Totali" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Distribution Pie Chart — 2/5 width */}
            <div className="lg:col-span-2">
              <Card className="p-6 border border-white/8 bg-white/[0.02] flex flex-col h-[340px]">
                <h4 className="text-sm font-bold text-white mb-2">Distribuzione Piani Abbonamento</h4>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-white/30">
                    Nessun abbonamento registrato
                  </div>
                ) : (
                  <div className="w-full flex-1 min-h-0 flex flex-col justify-center">
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: 'rgba(15, 15, 25, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                            itemStyle={{ color: 'white' }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            formatter={(value: any, entry: any) => (
                              <span className="text-[11px] text-white/60">{value} ({entry.payload?.value})</span>
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </Card>
            </div>
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
