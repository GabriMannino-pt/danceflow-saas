import type { Student } from '@/types';

/**
 * Pulisce e normalizza un numero di telefono per l'utilizzo con l'API wa.me
 * Se il numero è italiano (10 cifre che inizia per 3), prepone il prefisso internazionale 39.
 */
export function cleanPhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // Se è un cellulare italiano standard a 10 cifre senza prefisso
  if (digits.length === 10 && digits.startsWith('3')) {
    return `39${digits}`;
  }
  // Se ha già il prefisso internazionale (es. 39340...)
  if (digits.length >= 11 && digits.startsWith('393')) {
    return digits;
  }
  return digits;
}

/**
 * Ricava il miglior recapito telefonico dell'allievo o del genitore
 */
export function getStudentWhatsAppPhone(student?: Student | null): string | null {
  if (!student || !student.contact) return null;
  const raw = student.contact.parentPhone || student.contact.studentPhone;
  return cleanPhoneNumber(raw);
}

/**
 * Apre WhatsApp Web o l'app WhatsApp Desktop/Mobile con il messaggio precompilato
 */
export function openWhatsAppChat(phone: string, message: string): void {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return;
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${cleaned}?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Genera il messaggio di sollecito per una retta o quota in sospeso
 * Formato richiesto: "Nome genitore, Allievo, Mese, Importo" (SENZA IBAN)
 */
export function buildPaymentReminderWhatsAppMessage({
  parentName,
  studentName,
  monthOrDescription,
  amountDue,
  schoolName = 'Tropical Style Caribbean School',
}: {
  parentName?: string | null;
  studentName: string;
  monthOrDescription: string;
  amountDue: number;
  schoolName?: string;
}): string {
  const salutation = parentName?.trim() ? `Gentile ${parentName.trim()}` : `Gentile Genitore / Allievo`;
  const formattedAmount = amountDue.toFixed(2);

  return `Ciao ${salutation},\nti ricordiamo che per l'allievo ${studentName} risulta in sospeso la retta di ${monthOrDescription} per un importo di €${formattedAmount}.\nTi invitiamo a regolarizzare la quota in segreteria.\n\nUn cordiale saluto,\n${schoolName}`;
}

/**
 * Genera il messaggio di promemoria per il Certificato Medico mancante o scaduto
 */
export function buildMedicalReminderWhatsAppMessage({
  parentName,
  studentName,
  isExpired,
  expiryDateStr,
  schoolName = 'Tropical Style Caribbean School',
}: {
  parentName?: string | null;
  studentName: string;
  isExpired: boolean;
  expiryDateStr?: string | null;
  schoolName?: string;
}): string {
  const salutation = parentName?.trim() ? `Gentile ${parentName.trim()}` : `Gentile Genitore / Allievo`;
  const reason = isExpired
    ? (expiryDateStr ? `è scaduto il ${expiryDateStr}` : 'risulta scaduto')
    : 'non risulta ancora consegnato';

  return `Ciao ${salutation},\nti ricordiamo che per l'allievo ${studentName} il certificato medico di idoneità alla danza ${reason}.\nPer motivi assicurativi e legali è necessario rinnovarlo per poter frequentare le lezioni.\nTi invitiamo a consegnarlo in segreteria oppure a caricarlo direttamente dal tuo Portale Allievi.\n\nGrazie per la collaborazione,\n${schoolName}`;
}

/**
 * Genera il messaggio di sollecito per il Codice Fiscale mancante
 */
export function buildFiscalCodeReminderWhatsAppMessage({
  parentName,
  studentName,
  schoolName = 'Tropical Style Caribbean School',
}: {
  parentName?: string | null;
  studentName: string;
  schoolName?: string;
}): string {
  const salutation = parentName?.trim() ? `Gentile ${parentName.trim()}` : `Gentile Genitore / Allievo`;

  return `Ciao ${salutation},\nper completare il tesseramento sportivo e la copertura assicurativa di ${studentName}, ti chiediamo cortesemente di comunicarci il Codice Fiscale dell'allievo.\nPuoi inviarlo rispondendo a questo messaggio oppure aggiornarlo nel tuo Portale Allievi.\n\nGrazie per la collaborazione,\n${schoolName}`;
}
