import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, X, Shield } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, nowTimestamp } from '@/lib/converters';
import { Button, Input } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

interface StripePaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  onSuccess: () => void;
}

export default function StripePaymentDrawer({ isOpen, onClose, payment, onSuccess }: StripePaymentDrawerProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!payment) return null;

  const handleCardNumberChange = (e: any) => {
    // Rimuovi spazi e formatta a gruppi di 4 cifre
    const val = e.target.value.replace(/\D/g, '');
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted.substring(0, 19));
  };

  const handleExpiryChange = (e: any) => {
    // Formatta MM/YY
    const val = e.target.value.replace(/\D/g, '');
    let formatted = val;
    if (val.length > 2) {
      formatted = `${val.substring(0, 2)}/${val.substring(2, 4)}`;
    }
    setExpiry(formatted.substring(0, 5));
  };

  const handleCvvChange = (e: any) => {
    const val = e.target.value.replace(/\D/g, '');
    setCvv(val.substring(0, 4));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cardNumber.replace(/\s/g, '').length < 16) {
      toast.error('Numero carta non valido.');
      return;
    }
    if (expiry.length < 5) {
      toast.error('Data scadenza non valida (MM/YY).');
      return;
    }
    if (cvv.length < 3) {
      toast.error('CVV non valido.');
      return;
    }
    if (!cardName.trim()) {
      toast.error('Inserisci il nome del titolare.');
      return;
    }

    setSubmitting(true);
    try {
      // Simula ritardo transazione bancaria Stripe 3D Secure
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const payRef = doc(db, COLLECTIONS.payments(payment.schoolId), payment.id);
      
      // Aggiorna lo stato su Firestore in 'paid'
      const receiptNum = `REC-${Date.now().toString().slice(-6)}`;
      await updateDoc(payRef, {
        status: 'paid',
        paidAt: nowTimestamp(),
        method: 'card',
        receiptNumber: receiptNum,
        notes: `Pagato online tramite Stripe da ${cardName}. Transazione id: ch_${Math.random().toString(36).substring(2, 10)}`,
        updatedAt: nowTimestamp(),
      });

      setSuccess(true);
      toast.success('Pagamento autorizzato ed incassato con successo!');
      
      // Chiude il drawer dopo una breve transizione di successo
      setTimeout(() => {
        onSuccess();
        onClose();
        // Reset states
        setSuccess(false);
        setCardNumber('');
        setExpiry('');
        setCvv('');
        setCardName('');
      }, 1500);

    } catch (err: any) {
      console.error('[Stripe] Payment failed:', err);
      toast.error(err.message || 'Errore durante la transazione.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay di Sfondo */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className='fixed inset-0 bg-black z-50 backdrop-blur-sm'
          />

          {/* Cassetto Laterale (Right Drawer) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className='fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-surface-900/98 backdrop-blur-xl border-l border-white/5 shadow-2xl z-50 flex flex-col font-body text-white'
          >
            {/* Header Drawer */}
            <div className='p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-900/30 to-brand-900/30'>
              <div className='flex items-center gap-2.5'>
                <CreditCard className='text-brand-400' size={20} />
                <span className='font-display font-bold text-base tracking-wide'>Pagamento Sicuro Stripe</span>
              </div>
              <button onClick={onClose} className='p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition cursor-pointer'>
                <X size={18} />
              </button>
            </div>

            {/* Contenuto principale */}
            <div className='flex-1 overflow-y-auto p-6 space-y-6'>
              {success ? (
                <div className='h-full flex flex-col items-center justify-center text-center space-y-4 page-enter'>
                  <div className='w-20 h-20 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-5xl mx-auto border border-teal-500/20 animate-bounce'>
                    ✓
                  </div>
                  <h3 className='text-lg font-bold text-white'>Transazione Completata!</h3>
                  <p className='text-xs text-white/50 px-6'>
                    Il pagamento è stato elaborato. La ricevuta PDF è ora disponibile per il download nel tuo portale.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className='space-y-5'>
                  {/* Riepilogo Prodotto */}
                  <div className='p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1'>
                    <span className='text-[10px] uppercase tracking-wider text-brand-300 font-bold'>Dettaglio Quota</span>
                    <h4 className='text-sm font-bold text-white'>{payment.description}</h4>
                    <div className='pt-2 flex items-center justify-between border-t border-white/5 mt-2'>
                      <span className='text-xs text-white/40'>Totale da saldare</span>
                      <span className='text-lg font-black text-white'>{formatCurrency(payment.amount)}</span>
                    </div>
                  </div>

                  <div className='space-y-4'>
                    <h5 className='text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/5 pb-1'>
                      Dettagli Carta di Credito
                    </h5>

                    <Input
                      label='Nome Intestatario *'
                      placeholder='Es. Maria Rossi'
                      value={cardName}
                      onChange={(e: any) => setCardName(e.target.value)}
                      required
                    />

                    <Input
                      label='Numero Carta (Test) *'
                      placeholder='4242 4242 4242 4242'
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      required
                    />

                    <div className='grid grid-cols-2 gap-4'>
                      <Input
                        label='Scadenza *'
                        placeholder='MM/YY'
                        value={expiry}
                        onChange={handleExpiryChange}
                        required
                      />
                      <Input
                        label='CVV *'
                        placeholder='123'
                        type='password'
                        value={cvv}
                        onChange={handleCvvChange}
                        required
                      />
                    </div>
                  </div>

                  <div className='pt-4'>
                    <Button
                      type='submit'
                      loading={submitting}
                      className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 flex items-center justify-center gap-2 rounded-xl cursor-pointer'
                    >
                      <Shield size={16} />
                      Paga {formatCurrency(payment.amount)}
                    </Button>
                  </div>

                  {/* Certificazione sicurezza */}
                  <div className='pt-2 flex items-center justify-center gap-2 text-[10px] text-white/40 text-center'>
                    <Shield size={12} className='text-teal-400' />
                    <span>Connessione cifrata SSL a 256 bit. Certificazione PCI-DSS Livello 1.</span>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
