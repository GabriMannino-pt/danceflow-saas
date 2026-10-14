import { doc, runTransaction, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ReceiptCounterData {
  year: number;
  nextNumber: number;
  updatedAt?: Timestamp;
}

/**
 * Ottiene il prossimo numero progressivo per le ricevute della scuola.
 * Per il 2026 parte dal numero 112 (richiesta esplicita direzione Tropical Style).
 * Dal 1° Gennaio di ogni anno successivo (es. 2027) riparte automaticamente dal numero 1.
 */
export async function getNextReceiptNumber(schoolId: string): Promise<string> {
  if (!schoolId) throw new Error('schoolId mancante per la generazione della ricevuta');
  const currentYear = new Date().getFullYear();
  const counterRef = doc(db, `schools/${schoolId}/counters/receipts`);

  const assignedNumber = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    let numToUse = 112;

    if (!snap.exists()) {
      numToUse = currentYear === 2026 ? 112 : 1;
    } else {
      const data = snap.data() as ReceiptCounterData;
      // Se l'anno fiscale è cambiato (es. siamo passati al 2027), azzera e riparti da 1
      if (data.year !== currentYear) {
        numToUse = 1;
      } else {
        numToUse = typeof data.nextNumber === 'number' ? data.nextNumber : (currentYear === 2026 ? 112 : 1);
      }
    }

    transaction.set(
      counterRef,
      {
        year: currentYear,
        nextNumber: numToUse + 1,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return numToUse;
  });

  return assignedNumber.toString();
}

/**
 * Legge la configurazione corrente del contatore ricevute per visualizzazione nelle impostazioni.
 */
export async function getReceiptCounter(schoolId: string): Promise<ReceiptCounterData> {
  const currentYear = new Date().getFullYear();
  const counterRef = doc(db, `schools/${schoolId}/counters/receipts`);
  const snap = await getDoc(counterRef);

  if (!snap.exists()) {
    return {
      year: currentYear,
      nextNumber: currentYear === 2026 ? 112 : 1,
    };
  }

  const data = snap.data() as ReceiptCounterData;
  if (data.year !== currentYear) {
    return {
      year: currentYear,
      nextNumber: 1,
    };
  }

  return {
    year: data.year,
    nextNumber: typeof data.nextNumber === 'number' ? data.nextNumber : (currentYear === 2026 ? 112 : 1),
    updatedAt: data.updatedAt,
  };
}

/**
 * Permette alla direzione di aggiornare manualmente il contatore (es. se emette ricevute cartacee).
 */
export async function updateReceiptCounter(schoolId: string, nextNumber: number, year?: number): Promise<void> {
  const currentYear = year || new Date().getFullYear();
  const counterRef = doc(db, `schools/${schoolId}/counters/receipts`);
  await setDoc(
    counterRef,
    {
      year: currentYear,
      nextNumber: Math.max(1, Number(nextNumber)),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
