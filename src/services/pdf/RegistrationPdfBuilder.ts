import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

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
  // 1. Calculate Hash of the Document Data for integrity auditing
  const documentPayload = JSON.stringify({
    student: {
      firstName: student.firstName,
      lastName: student.lastName,
      fiscalCode: student.fiscalCode,
    },
    fes: {
      ipAddress: fes.ipAddress,
      timestamp: fes.timestamp,
      userAgent: fes.userAgent,
      sessionId: fes.sessionId,
    },
    signatureLength: signatureBase64.length,
  });
  
  const docHash = await calculateSHA256(documentPayload);
  const formattedDate = format(new Date(fes.timestamp), 'dd/MM/yyyy HH:mm:ss.SSS', { locale: it });

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

  // School Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(school.name, 50, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  const schoolStreet = school.address?.street || 'Indirizzo non specificato';
  const schoolCity = `${school.address?.postalCode || ''} ${school.address?.city || ''} (${school.address?.province || ''})`;
  const schoolContact = `Email: ${school.contact?.email || ''} | Tel: ${school.contact?.phone || ''}`;
  const schoolFiscal = `P.IVA/CF: ${school.contact?.website || 'Non specificato'}`;
  doc.text(schoolStreet, 50, 27);
  doc.text(schoolCity, 50, 31);
  doc.text(schoolContact, 50, 35);
  doc.text(schoolFiscal, 50, 39);

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

  doc.text(`Cognome: ${student.lastName}`, 25, 78);
  doc.text(`Nome: ${student.firstName}`, 90, 78);
  doc.text(`Genere: ${student.gender || '—'}`, 150, 78);

  doc.text(`Data di Nascita: ${birthDateStr}`, 25, 84);
  doc.text(`Codice Fiscale: ${student.fiscalCode || '—'}`, 90, 84);

  const addressStr = `${student.address.street || '—'}, ${student.address.postalCode || ''} ${student.address.city || ''} (${student.address.province || ''})`;
  doc.text(`Indirizzo Residenza: ${addressStr}`, 25, 90);
  
  doc.text(`Telefono Allievo: ${student.contact.studentPhone || '—'}`, 25, 96);
  doc.text(`Email Allievo: ${student.contact.studentEmail || '—'}`, 90, 96);

  // --- PARENT / GUARDIAN (if minor) ---
  let yOffset = 114;
  if (student.contact.parentName) {
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
    doc.text(`Nominativo: ${student.contact.parentName} (${student.contact.parentRelation || 'Genitore'})`, 25, yOffset + 12);
    doc.text(`Telefono Genitore: ${student.contact.parentPhone || '—'}`, 25, yOffset + 18);
    doc.text(`Email Genitore: ${student.contact.parentEmail || '—'}`, 90, yOffset + 18);
    
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

  // Add signature image (Base64 PNG)
  try {
    doc.addImage(signatureBase64, 'PNG', 20, sigY + 3, 50, 15);
  } catch (imgError) {
    console.error('Error adding signature image to PDF:', imgError);
    doc.rect(20, sigY + 3, 50, 15);
    doc.setFontSize(8);
    doc.setTextColor(150, 0, 0);
    doc.text('[Errore Acquisizione Firma]', 22, sigY + 11);
  }

  // Draw signature line
  doc.setDrawColor(180, 180, 180);
  doc.line(20, sigY + 20, 80, sigY + 20);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const signerName = student.contact.parentName || `${student.firstName} ${student.lastName}`;
  doc.text(`Firmatario: ${signerName}`, 20, sigY + 23);

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
  
  doc.text(`TIMESTAMP: ${formattedDate} (${fes.timestamp} ms)`, 23, fesY + 8);
  doc.text(`CLIENT IP: ${fes.ipAddress}`, 23, fesY + 11);
  
  const maxUaLen = 90;
  const uaText = fes.userAgent.length > maxUaLen 
    ? `${fes.userAgent.substring(0, maxUaLen)}...` 
    : fes.userAgent;
  doc.text(`USER AGENT: ${uaText}`, 23, fesY + 14);
  
  doc.text(`SESSION ID: ${fes.sessionId}`, 23, fesY + 17);
  
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
