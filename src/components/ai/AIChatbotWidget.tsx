import React, { useState, useRef, useEffect } from 'react';
import { useSchoolStore } from '@/stores/schoolStore';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isFallback?: boolean;
}

export function AIChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Ciao! Sono Danzila 💃, il tuo assistente AI intelligente. Come posso aiutarti a gestire la scuola di danza oggi?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get real data from schoolStore
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const students = useSchoolStore((s) => s.students);
  const payments = useSchoolStore((s) => s.payments);
  const courses = useSchoolStore((s) => s.courses);

  const activeStudents = React.useMemo(() => students.filter(s => s.isActive && !s.isDeleted), [students]);
  const activeCourses = React.useMemo(() => courses.filter(c => c.isActive && !c.isDeleted), [courses]);

  // Auto Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Calculations for system prompt and local fallback engine
  const activeStudentsCount = activeStudents.length;
  const activeCoursesNames = activeCourses.map(c => `${c.name} (${c.style} - ${c.level})`).join(', ');
  const totalOverdueAmount = payments
    .filter(p => p.status === 'overdue')
    .reduce((sum, p) => sum + p.amount, 0);

  // Construct the Claude system prompt with real school metrics
  const systemPrompt = `Sei Danzila, l'assistente virtuale ufficiale della scuola di danza "${activeSchool?.name || 'DanceFlow'}".
Il tuo compito è aiutare gli amministratori e gli insegnanti a gestire la scuola rispondendo alle loro domande con tono amichevole, professionale ed entusiasta della danza.

Dati reali correnti della scuola:
- Nome della scuola di danza: ${activeSchool?.name || 'DanceFlow'}
- Numero totale allievi attivi: ${activeStudentsCount} allievi attivi (su un totale di ${students.filter(s => !s.isDeleted).length} registrati)
- Corsi attivi offerti: ${activeCoursesNames || 'Nessun corso attivo configurato'}
- Numero corsi totali: ${activeCourses.length}
- Morosità totale da riscuotere (quote insolute scadute): €${totalOverdueAmount.toFixed(2)}

Rispondi sempre in italiano. Sii estremamente preciso usando i dati reali forniti sopra se l'utente chiede statistiche. Se l'utente fa domande generali sulla danza, rispondi con calore e competenza professionale.`;

  // Local fallback engine (when API key is missing or calls fail)
  const handleLocalFallback = (query: string): string => {
    const q = query.toLowerCase();

    if (q.includes('alliev') || q.includes('student') || q.includes('iscritt')) {
      return `Attualmente la scuola "${activeSchool?.name || 'DanceFlow'}" conta ${activeStudentsCount} allievi attivi (su un totale di ${students.filter(s => !s.isDeleted).length} allievi inseriti).`;
    }

    if (q.includes('cors') || q.includes('schedul') || q.includes('lezion')) {
      if (activeCourses.length === 0) {
        return `Non ci sono corsi attivi inseriti in questo momento nella scuola.`;
      }
      return `La scuola offre ${activeCourses.length} corsi attivi:\n${activeCourses.map(c => `• ${c.name} (Stile: ${c.style}, Livello: ${c.level})`).join('\n')}`;
    }

    if (q.includes('moros') || q.includes('insolut') || q.includes('debit') || q.includes('pagament') || q.includes('sold')) {
      return `La morosità totale da riscuotere per la scuola ammonta a €${totalOverdueAmount.toFixed(2)}. Ci sono diversi pagamenti insoluti contrassegnati come 'Scaduto' nella sezione Pagamenti.`;
    }

    if (q.includes('ciao') || q.includes('salve') || q.includes('buongiorno')) {
      return `Ciao! Sono Danzila 💃. Sto rispondendo in modalità offline locale. Chiedimi pure dettagli sugli allievi attivi, i corsi offerti o la situazione morosità della scuola!`;
    }

    return `Sono Danzila, l'assistente della tua scuola. Attualmente rispondo in modalità locale. Puoi chiedermi info su:\n- Allievi attivi (${activeStudentsCount})\n- Corsi attivi (${activeCourses.length})\n- Morosità totale (Ref. €${totalOverdueAmount.toFixed(2)})`;
  };

  // Send message flow
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isSending) return;

    const userQuery = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsSending(true);

    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;

    if (!apiKey) {
      // Graceful fallback to local engine if key is absent
      setTimeout(() => {
        const localResponse = handleLocalFallback(userQuery);
        setMessages(prev => [...prev, { role: 'assistant', content: localResponse, isFallback: true }]);
        setIsSending(false);
      }, 800);
      return;
    }

    try {
      // Direct call to Anthropic API via proxy or directly (handling CORS fallback if needed)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          // Note: In client-only builds direct calls may be blocked by CORS depending on local network rules,
          // but we supply the precise parameters requested.
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userQuery }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      const assistantText = responseData.content?.[0]?.text || 'Nessuna risposta ricevuta.';
      
      setMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (error) {
      console.warn('[Danzila Chatbot] Claude API Call encountered an issue. Falling back to local keyword engine:', error);
      
      // Fallback to local engine immediately on network/CORS error
      const localResponse = handleLocalFallback(userQuery);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: localResponse + '\n\n*(Risposta generata dal motore locale offline)*',
          isFallback: true
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Quick reply options
  const quickReplies = [
    'Quanti allievi attivi ci sono?',
    'Elenca i corsi attivi',
    'A quanto ammonta la morosità?'
  ];

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full btn-primary-gradient flex items-center justify-center shadow-[0_8px_32px_rgba(124,58,237,0.5)] border border-brand-400/30 cursor-pointer z-50 transition-all duration-300 hover:scale-110 active:scale-95 animate-pulse-glow"
        aria-label="Apri Chatbot Danzila"
      >
        {isOpen ? <X size={24} className="text-white" /> : <MessageSquare size={24} className="text-white" />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[360px] max-w-[calc(100vw-32px)] h-[500px] glass rounded-3xl border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.6)] flex flex-col z-50 overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="p-4 bg-brand-950/40 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-300 flex items-center justify-center font-bold">
                💃
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-white flex items-center gap-1">
                  Danzila AI <Sparkles size={13} className="text-brand-300 animate-pulse" />
                </h3>
                <p className="text-[10px] text-white/50">Assistente virtuale della scuola</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white/10 text-brand-300 border border-white/5'
                  }`}
                >
                  {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                </div>
                <div
                  className={`rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand-600/30 text-white border border-brand-500/30 rounded-tr-none'
                      : 'bg-white/[0.04] text-white/90 border border-white/5 rounded-tl-none'
                  }`}
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {msg.content}
                  {msg.isFallback && (
                    <span className="block mt-2 text-[9px] text-gold-400/70 font-semibold flex items-center gap-1">
                      <AlertTriangle size={10} /> Modalità locale offline
                    </span>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex gap-2.5 max-w-[85%]">
                <div className="w-7 h-7 rounded-lg bg-white/10 text-brand-300 border border-white/5 flex items-center justify-center">
                  <Bot size={13} />
                </div>
                <div className="bg-white/[0.04] text-white/60 border border-white/5 rounded-2xl rounded-tl-none p-3 text-xs flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies */}
          {messages.length === 1 && !isSending && (
            <div className="px-4 py-2 flex flex-col gap-1.5 border-t border-white/5 bg-black/10">
              <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-1">
                <HelpCircle size={10} /> Domande frequenti
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(reply);
                    }}
                    className="text-[10px] px-2.5 py-1 rounded-lg border border-white/5 bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/5 hover:border-brand-500/20 transition-all duration-200 text-left cursor-pointer"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="p-3 bg-brand-950/20 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Chiedi a Danzila..."
              disabled={isSending}
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="w-8 h-8 rounded-lg btn-primary-gradient flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
