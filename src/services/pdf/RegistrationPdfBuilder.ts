import jsPDF from 'jspdf';
import { format, differenceInYears } from 'date-fns';
import { it } from 'date-fns/locale';
import { getSchoolFiscalInfo } from '@/lib/pdf';

interface StudentPdfData {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: any; // Timestamp or ISO string or Date
  fiscalCode: string;
  birthPlace?: string;
  address: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
  };
  contact: {
    studentPhone?: string;
    studentEmail?: string;
    parentName?: string;
    parentRelation?: string;
    parentPhone?: string;
    parentEmail?: string;
    fiscalName?: string;
    fiscalCode?: string;
  };
}

interface SchoolPdfData {
  name: string;
  logoURL?: string;
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    website?: string;
  };
}

interface FesMetadata {
  ipAddress: string;
  timestamp: number;
  userAgent: string;
  sessionId: string;
}

async function calculateSHA256(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateRegistrationPdf(
  student: StudentPdfData,
  school: SchoolPdfData,
  signatureBase64: string,
  fes: FesMetadata,
  academicYear = '2025/2026'
): Promise<{ blob: Blob; hash: string }> {
  // Defensive sanitization for dirty/legacy/partial data
  const safeFirstName = (student?.firstName || '').trim() || '—';
  const safeLastName = (student?.lastName || '').trim() || '—';
  const safeFiscalCode = (student?.fiscalCode || '').trim().toUpperCase() || '—';
  const safeGender = (student?.gender || '').trim() || '—';
  const safeAddr = student?.address || { street: '', city: '', province: '', postalCode: '' };
  const safeContact = student?.contact || {};
  const safeSig = typeof signatureBase64 === 'string' ? signatureBase64 : '';
  const safeTimestamp = fes?.timestamp && Number.isFinite(Number(fes.timestamp)) ? Number(fes.timestamp) : Date.now();
  const safeFes = {
    ipAddress: String(fes?.ipAddress || '127.0.0.1').trim() || '127.0.0.1',
    timestamp: safeTimestamp,
    userAgent: String(fes?.userAgent || 'Mozilla/5.0').trim() || 'Mozilla/5.0',
    sessionId: String(fes?.sessionId || 'N/D').trim() || 'N/D',
  };

  // 1. Calculate Hash of the Document Data for integrity auditing
  const documentPayload = JSON.stringify({
    student: {
      firstName: safeFirstName,
      lastName: safeLastName,
      fiscalCode: safeFiscalCode,
    },
    fes: safeFes,
    signatureLength: safeSig.length,
  });
  
  const docHash = await calculateSHA256(documentPayload);
  const formattedDate = format(new Date(safeFes.timestamp), 'dd/MM/yyyy HH:mm:ss.SSS', { locale: it });

  // 2. Initialize jsPDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor: [number, number, number] = [139, 92, 246]; // Brand Purple

  // --- HEADER ACCENT ---
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // School Logo area
  doc.setFillColor(243, 244, 246);
  doc.rect(20, 15, 25, 25, 'F');
  if (school.logoURL) {
    try {
      doc.addImage(school.logoURL, 'PNG', 20, 15, 25, 25);
    } catch {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('LOGO', 32.5, 28, { align: 'center' });
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('LOGO', 32.5, 28, { align: 'center' });
  }

  // School Info (Allineato ai dati fiscali ufficiali S.S.D. ARL LATIN GROUP)
  const fiscal = getSchoolFiscalInfo(school as any);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(fiscal.legalName, 50, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(fiscal.brandName, 50, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`Sede Legale: ${fiscal.fullAddress}`, 50, 30);
  doc.text(`Cod. Fisc. / P.IVA: ${fiscal.taxId || '05523810876'}`, 50, 34.5);
  if (fiscal.email) {
    doc.text(`Email: ${fiscal.email}${fiscal.phone ? ` | Tel: ${fiscal.phone}` : ''}`, 50, 39);
  }

  // Line separator
  doc.setDrawColor(220, 220, 220);
  doc.line(20, 45, pageWidth - 20, 45);

  // --- TITLE ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('MODULO DI ISCRIZIONE E CONSENSO PRIVACY (GDPR)', pageWidth / 2, 55, { align: 'center' });
  
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text(`Anno Accademico: ${academicYear}`, pageWidth / 2, 60, { align: 'center' });

  // --- STUDENT ANAGRAPHICS ---
  doc.setFillColor(249, 250, 251);
  doc.rect(20, 66, pageWidth - 40, 42, 'F');
  doc.setDrawColor(230, 235, 240);
  doc.rect(20, 66, pageWidth - 40, 42, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('DATI DELL\'ALLIEVO', 25, 72);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);

  let birthDateStr = '—';
  if (student.dateOfBirth) {
    try {
      const d = typeof student.dateOfBirth.toDate === 'function' 
        ? student.dateOfBirth.toDate() 
        : new Date(student.dateOfBirth);
      birthDateStr = format(d, 'dd/MM/yyyy');
    } catch {
      birthDateStr = String(student.dateOfBirth);
    }
  }

  doc.text(`Cognome: ${safeLastName}`, 25, 78);
  doc.text(`Nome: ${safeFirstName}`, 90, 78);
  doc.text(`Genere: ${safeGender}`, 150, 78);

  doc.text(`Data di Nascita: ${birthDateStr}`, 25, 84);
  doc.text(`Codice Fiscale: ${safeFiscalCode}`, 90, 84);

  const addressStr = `${(safeAddr.street || '').trim() || '—'}, ${(safeAddr.postalCode || '').trim()} ${(safeAddr.city || '').trim()} (${(safeAddr.province || '').trim()})`.replace(/\(\s*\)/, '').trim();
  doc.text(`Indirizzo Residenza: ${addressStr}`, 25, 90);
  
  doc.text(`Telefono Allievo: ${(safeContact.studentPhone || '').trim() || '—'}`, 25, 96);
  doc.text(`Email Allievo: ${(safeContact.studentEmail || '').trim() || '—'}`, 90, 96);

  // --- PARENT / GUARDIAN (only if minor or guardian distinct from student) ---
  let isMinor = false;
  if (student?.dateOfBirth) {
    try {
      const dob = typeof student.dateOfBirth.toDate === 'function'
        ? student.dateOfBirth.toDate()
        : new Date(student.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        isMinor = differenceInYears(new Date(), dob) < 18;
      }
    } catch {
      isMinor = false;
    }
  }
  const studentFullNameLower = `${safeFirstName} ${safeLastName}`.trim().toLowerCase();
  const parentCleanNameLower = (safeContact.parentName || '').trim().toLowerCase();
  const hasDistinctGuardian = Boolean(
    parentCleanNameLower &&
    safeContact.parentRelation !== 'allievo' &&
    parentCleanNameLower !== studentFullNameLower
  );

  let yOffset = 114;
  if (isMinor || hasDistinctGuardian) {
    doc.setFillColor(249, 250, 251);
    doc.rect(20, yOffset, pageWidth - 40, 24, 'F');
    doc.rect(20, yOffset, pageWidth - 40, 24, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('DATI DEL GENITORE / TUTORE LEGALE', 25, yOffset + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(`Nominativo: ${(safeContact.parentName || '').trim() || '—'} (${(safeContact.parentRelation || '').trim() || 'Genitore'})`, 25, yOffset + 12);
    doc.text(`Telefono Genitore: ${(safeContact.parentPhone || '').trim() || '—'}`, 25, yOffset + 18);
    doc.text(`Email Genitore: ${(safeContact.parentEmail || '').trim() || '—'}`, 90, yOffset + 18);
    
    yOffset += 30;
  }

  // --- PRIVACY AND RULES ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('DICHIARAZIONE DI CONSENSO E PRESA VISIONE DEL REGOLAMENTO', 20, yOffset);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);

  const privacyText = 
    `1. Il sottoscritto dichiara di aver preso visione e di accettare integralmente il regolamento interno della scuola di danza.\n` +
    `2. Consenso al trattamento dei dati personali (GDPR): Il sottoscritto autorizza il trattamento dei dati personali comuni e sensibili per le finalità istituzionali e organizzative della scuola di danza, ai sensi del Regolamento UE 2016/679.\n` +
    `3. Consenso all'uso delle immagini (Liberatoria Foto/Video): Si autorizza la scuola alla pubblicazione di foto o riprese video effettuate durante le lezioni, spettacoli ed eventi della scuola, per scopi promozionali, sul sito web e sui canali social della scuola.\n` +
    `4. Certificazione Medica: Ci si impegna a consegnare un certificato medico di idoneità all'attività sportiva non agonistica/agonistica in corso di validità entro l'inizio dei corsi.`;

  const splitPrivacy = doc.splitTextToSize(privacyText, pageWidth - 40);
  doc.text(splitPrivacy, 20, yOffset + 5);

  // --- SIGNATURE BLOCK ---
  const sigY = yOffset + 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('Firma digitale per presa visione e consenso:', 20, sigY);

  const resolvedSignerName =
    (isMinor || hasDistinctGuardian) && safeContact.parentName?.trim()
      ? safeContact.parentName.trim()
      : `${safeFirstName} ${safeLastName}`;

  // Add signature image (Base64 PNG) or cursive signature fallback
  try {
    const imgData = safeSig.trim().length > 50
      ? (safeSig.startsWith('data:image') ? safeSig : `data:image/png;base64,${safeSig}`)
      : null;

    if (imgData) {
      doc.addImage(imgData, 'PNG', 20, sigY + 3, 50, 15);
    } else {
      doc.setFont('times', 'italic');
      doc.setFontSize(13);
      doc.setTextColor(30, 40, 90);
      doc.text(resolvedSignerName, 22, sigY + 12);
    }
  } catch (imgError) {
    doc.setFont('times', 'italic');
    doc.setFontSize(13);
    doc.setTextColor(30, 40, 90);
    doc.text(resolvedSignerName, 22, sigY + 12);
  }

  // Draw signature line
  doc.setDrawColor(180, 180, 180);
  doc.line(20, sigY + 20, 80, sigY + 20);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Firmatario: ${resolvedSignerName}`, 20, sigY + 23);

  // --- FES AUDIT LOG BLOCK ---
  const fesY = pageHeight - 38;
  doc.setFillColor(245, 247, 250);
  doc.rect(20, fesY, pageWidth - 40, 22, 'F');
  doc.setDrawColor(220, 225, 230);
  doc.rect(20, fesY, pageWidth - 40, 22, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('METADATI DI SICUREZZA - FIRMA ELETTRONICA SEMPLICE (FES)', 23, fesY + 4);

  // Monospaced text for technical audit metadata
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  
  doc.text(`TIMESTAMP: ${formattedDate} (${safeFes.timestamp} ms)`, 23, fesY + 8);
  doc.text(`CLIENT IP: ${safeFes.ipAddress}`, 23, fesY + 11);
  
  const maxUaLen = 90;
  const uaText = safeFes.userAgent.length > maxUaLen 
    ? `${safeFes.userAgent.substring(0, maxUaLen)}...` 
    : safeFes.userAgent;
  doc.text(`USER AGENT: ${uaText}`, 23, fesY + 14);
  
  doc.text(`SESSION ID: ${safeFes.sessionId}`, 23, fesY + 17);
  
  // Right aligned metadata values
  doc.text(`SHA-256 HASH INTEGRITÀ DOCUMENTO:`, 110, fesY + 8);
  doc.text(docHash, 110, fesY + 11);

  // Bottom footer note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('Questo documento digitale ha valore legale quale modulo di iscrizione sottoscritto tramite FES.', pageWidth / 2, pageHeight - 8, { align: 'center' });

  return {
    blob: doc.output('blob'),
    hash: docHash,
  };
}
