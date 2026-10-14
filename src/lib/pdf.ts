import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { Payment, Student, School, Course } from '@/types';

// Helper to format date safely
function formatDate(date: any, formatStr: string = 'dd/MM/yyyy'): string {
  if (!date) return 'N/D';
  if (typeof date.toDate === 'function') {
    return format(date.toDate(), formatStr);
  }
  if (date instanceof Date) {
    return format(date, formatStr);
  }
  try {
    return format(new Date(date), formatStr);
  } catch {
    return 'N/D';
  }
}

export function getSchoolFiscalInfo(school?: School | null) {
  const isTropical = !school || !school.name || school.name.toLowerCase().includes('tropical') || school.id === 'OFLsxTdw5F2aHEvlj1RU';
  
  const brandName = isTropical ? 'Tropical Style Caribbean School' : (school?.name || 'Scuola di Danza');
  const legalName = (school as any)?.legalName || (isTropical ? 'S.S.D. ARL LATIN GROUP' : (school?.name || ''));
  const taxId = (school as any)?.taxId || (school as any)?.vatNumber || (school as any)?.fiscalCode || (isTropical ? '05523810876' : '');
  const street = (isTropical && (!school?.address?.street || school.address.street.includes('Boccaccio')))
    ? 'Via Carlo Goldoni, snc'
    : (school?.address?.street || 'Via Carlo Goldoni, snc');
  const postalCode = (isTropical && !school?.address?.postalCode) ? '95032' : (school?.address?.postalCode || '95032');
  const city = (isTropical && (!school?.address?.city || school.address.city.includes('Paternò'))) ? 'Belpasso' : (school?.address?.city || 'Belpasso');
  const province = (isTropical && !school?.address?.province) ? 'CT' : (school?.address?.province || 'CT');
  
  return {
    brandName,
    legalName,
    taxId,
    street,
    city,
    province,
    postalCode,
    fullAddress: `${street} - ${postalCode} ${city} (${province})`,
    email: isTropical ? 'info@tropicalstyle.it' : (school?.contact?.email && !school.contact.email.includes('gabri.mannino') ? school.contact.email : ''),
    phone: isTropical ? '' : (school?.contact?.phone && !school.contact.phone.includes('3939478583') ? school.contact.phone : ''),
  };
}

export async function generateReceiptPDF(
  payment: Payment,
  student: Student,
  school: School,
  course?: Course,
  installment?: { amount: number; date: any; method: string; notes?: string }
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [139, 92, 246]; // Brand Purple
  const fiscal = getSchoolFiscalInfo(school);

  // --- HEADER ---
  doc.setFillColor(243, 244, 246);
  doc.rect(20, 18, 30, 30, 'F');
  if (school?.logoURL) {
    // Logo loading could be done here if needed
  } else {
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('LOGO', 35, 34, { align: 'center' });
  }

  // School Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(fiscal.brandName, 56, 25);
  
  // Ragione Sociale Ufficiale
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text(fiscal.legalName, 56, 31);

  // Indirizzo Sede Legale & Dati Fiscali
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(fiscal.fullAddress, 56, 37);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(`Cod. Fisc. / P. IVA: ${fiscal.taxId}`, 56, 43);

  if (fiscal.email) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Email: ${fiscal.email}`, 56, 48);
  }

  // Line separator
  doc.setDrawColor(220, 226, 235);
  doc.line(20, 52, pageWidth - 20, 52);

  // --- RECEIPT INFO ---
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  
  const isInstallment = !!installment;
  doc.text(isInstallment ? 'RICEVUTA DI ACCONTO / VERSAMENTO PARZIALE' : 'RICEVUTA DI PAGAMENTO', 20, 63);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Ricevuta N°: ${payment.receiptNumber || 'N/D'}`, pageWidth - 20, 61, { align: 'right' });
  doc.text(`Data Emissione: ${isInstallment ? formatDate(installment.date) : formatDate(payment.paidAt || new Date())}`, pageWidth - 20, 67, { align: 'right' });

  // --- STUDENT INFO ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(20, 74, pageWidth - 40, 30, 'FD');
  
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Intestatario / Allievo:', 25, 82);
  doc.setFont('helvetica', 'normal');
  doc.text(`${(student.lastName || '').toUpperCase()} ${(student.firstName || '').toUpperCase()}`, 25, 88);
  doc.text(`Codice Fiscale: ${(student.fiscalCode || 'Non specificato').toUpperCase()}`, 25, 94);
  if (student.contact?.parentName) {
    doc.text(`Genitore / Esercente Resp.: ${student.contact.parentName}`, 25, 100);
  }

  // --- PAYMENT DETAILS ---
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Dettaglio Operazione:', 20, 118);

  // Table header
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(20, 123, pageWidth - 40, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.text('Descrizione', 25, 129);
  doc.text('Importo', pageWidth - 25, 129, { align: 'right' });

  // Table body
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  
  const yPos = 142;
  const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  let desc = payment.description;
  if (payment.type === 'monthly') {
    const pMonths: number[] = (payment as any).months || (payment.month ? [payment.month] : []);
    if (pMonths.length > 1) {
      const mNames = pMonths.map(m => monthNames[m - 1]).filter(Boolean).join(', ');
      desc = `Quota Mensile - Mesi di ${mNames} ${payment.year || new Date().getFullYear()}`;
    } else if (payment.month && payment.year) {
      desc = `Quota Mensile - Mese di ${monthNames[payment.month - 1]} ${payment.year}`;
    }
  }
  if (course && !desc.includes(course.name)) {
    desc += ` (Corso: ${course.name})`;
  }

  doc.text(desc, 25, yPos);
  
  const displayAmount = isInstallment ? installment.amount : (payment.paidAmount ?? payment.amount);
  doc.text(`€ ${displayAmount.toFixed(2)}`, pageWidth - 25, yPos, { align: 'right' });

  // Summary lines
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 155, pageWidth - 20, 155);
  
  let summaryY = 166;
  doc.setFontSize(9.5);
  
  const totalDue = payment.totalAmount ?? payment.amount ?? displayAmount;
  const paidSoFar = payment.paidAmount ?? displayAmount;
  const remaining = payment.remainingAmount !== undefined ? payment.remainingAmount : Math.max(0, totalDue - paidSoFar);

  if (isInstallment || remaining > 0) {
    doc.text(`Importo Totale Dovuto:`, pageWidth - 100, summaryY);
    doc.text(`€ ${totalDue.toFixed(2)}`, pageWidth - 25, summaryY, { align: 'right' });
    
    summaryY += 6;
    doc.text(`Questo Versamento:`, pageWidth - 100, summaryY);
    doc.setFont('helvetica', 'bold');
    doc.text(`€ ${displayAmount.toFixed(2)}`, pageWidth - 25, summaryY, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    summaryY += 6;
    doc.text(`Totale Già Pagato:`, pageWidth - 100, summaryY);
    doc.text(`€ ${paidSoFar.toFixed(2)}`, pageWidth - 25, summaryY, { align: 'right' });

    summaryY += 7;
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.line(pageWidth - 100, summaryY - 3, pageWidth - 20, summaryY - 3);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`DEBITO RESIDUO:`, pageWidth - 100, summaryY);
    doc.text(`€ ${Math.max(0, remaining).toFixed(2)}`, pageWidth - 25, summaryY, { align: 'right' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`TOTALE PAGATO:`, pageWidth - 100, summaryY);
    doc.text(`€ ${displayAmount.toFixed(2)}`, pageWidth - 25, summaryY, { align: 'right' });
  }

  // Method
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const methodMap: Record<string, string> = {
    cash: 'Contanti',
    bank_transfer: 'Bonifico Bancario',
    card: 'Carta di Credito / Bancomat',
    stripe: 'Pagamento Online (Stripe)',
    other: 'Altro',
  };
  const activeMethod = isInstallment ? installment.method : payment.method;
  doc.text(`Metodo di pagamento utilizzato: ${activeMethod ? methodMap[activeMethod] || activeMethod : 'N/D'}`, 20, 205);
  if (isInstallment && installment.notes) {
    doc.text(`Note versamento: ${installment.notes}`, 20, 211);
  } else if (payment.notes) {
    doc.text(`Note: ${payment.notes}`, 20, 211);
  }

  // --- FOOTER ---
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento non valido ai fini fiscali come fattura elettronica ove prevista la sua obbligatorietà.', pageWidth / 2, 280, { align: 'center' });

  return doc;
}

export async function generateMeasurementsPDF(student: Student, school: School) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [139, 92, 246];

  // Title block
  doc.setFillColor(243, 244, 246);
  doc.rect(20, 20, pageWidth - 40, 20, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('SCHEDA SARTORIA & MISURE CORPOREE', pageWidth / 2, 32, { align: 'center' });

  // Student details
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Allievo/a: ${student.lastName} ${student.firstName}`, 20, 55);
  doc.text(`Data di Nascita: ${formatDate(student.dateOfBirth)}`, 20, 62);
  doc.text(`Scuola: ${school.name}`, 20, 69);
  doc.text(`Ultima Misurazione: ${student.costumes?.lastMeasuredAt ? formatDate(student.costumes.lastMeasuredAt) : 'N/D'}`, pageWidth - 20, 55, { align: 'right' });

  // Table grid for measurements
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(20, 80, pageWidth - 40, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Parametro Corporeo', 25, 85);
  doc.text('Valore Rilevato', pageWidth - 25, 85, { align: 'right' });

  const measures = [
    { label: 'Altezza (cm)', val: student.costumes?.height ? `${student.costumes.height} cm` : 'Non rilevata' },
    { label: 'Peso (kg)', val: student.costumes?.weight ? `${student.costumes.weight} kg` : 'Non rilevato' },
    { label: 'Circonferenza Petto (cm)', val: student.costumes?.chest ? `${student.costumes.chest} cm` : 'Non rilevata' },
    { label: 'Circonferenza Vita (cm)', val: student.costumes?.waist ? `${student.costumes.waist} cm` : 'Non rilevata' },
    { label: 'Circonferenza Fianchi (cm)', val: student.costumes?.hips ? `${student.costumes.hips} cm` : 'Non rilevata' },
    { label: 'Taglia Scarpe', val: student.costumes?.shoeSize ? `${student.costumes.shoeSize}` : 'Non rilevata' },
  ];

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  let y = 96;
  measures.forEach((m) => {
    doc.text(m.label, 25, y);
    doc.text(m.val, pageWidth - 25, y, { align: 'right' });
    doc.setDrawColor(240, 240, 240);
    doc.line(20, y + 3, pageWidth - 20, y + 3);
    y += 10;
  });

  // Notes section
  doc.setFont('helvetica', 'bold');
  doc.text('Note e Indicazioni Sartoriali:', 20, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  
  const notesText = student.costumes?.notes || 'Nessuna nota sartoriale aggiuntiva inserita per questo allievo.';
  const splitNotes = doc.splitTextToSize(notesText, pageWidth - 40);
  doc.text(splitNotes, 20, y + 18);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generato da Tropical Style Caribbean School il ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 280, { align: 'center' });

  return doc;
}

export async function generateCourseRegisterPDF(course: Course, students: Student[], school: School) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [139, 92, 246];

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`REGISTRO PRESENZE - ${course.name.toUpperCase()}`, 20, 25);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Stile: ${course.style} | Livello: ${course.level} | Anno Accademico: ${course.academicYear}`, 20, 31);
  doc.text(`Scuola: ${school.name}`, pageWidth - 20, 25, { align: 'right' });

  // Attendance grid header
  const tableY = 40;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(20, tableY, pageWidth - 40, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Allievo', 23, tableY + 5.5);
  
  // Draw column separators and numbers for dates
  const startX = 90;
  const colWidth = (pageWidth - 20 - startX) / 12; // 12 presence check columns
  
  for (let i = 0; i < 12; i++) {
    const x = startX + (i * colWidth);
    doc.text((i + 1).toString(), x + (colWidth / 2), tableY + 5.5, { align: 'center' });
  }

  // Draw rows
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  let currentY = tableY + 8;
  const rowHeight = 9;

  students.forEach((student, index) => {
    // Zebra striping
    if (index % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(20, currentY, pageWidth - 40, rowHeight, 'F');
    }
    
    // Draw outer row border
    doc.setDrawColor(220, 220, 220);
    doc.rect(20, currentY, pageWidth - 40, rowHeight);
    
    // Student name
    doc.text(`${student.lastName} ${student.firstName}`, 23, currentY + 5.5);

    // Grid vertical lines for columns
    for (let i = 0; i < 12; i++) {
      const x = startX + (i * colWidth);
      doc.line(x, currentY, x, currentY + rowHeight);
    }

    currentY += rowHeight;
  });

  // Footer notes for date writing
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Istruzioni: Scrivere la data in cima alle colonne numerate ed inserire P (presente), A (assente) o giustificazioni nelle caselle.', 20, currentY + 10);
  doc.text(`Documento generato il ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - 20, currentY + 10, { align: 'right' });

  return doc;
}

export async function generateStudentsListPDF(students: Student[], school: School) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [139, 92, 246];

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('ELENCO ANAGRAFICO ALLIEVI', 20, 25);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Scuola: ${school.name} | Totale Allievi: ${students.length}`, 20, 31);

  // Table
  const tableY = 40;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(20, tableY, pageWidth - 40, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Nominativo', 23, tableY + 5.5);
  doc.text('Nascita', 80, tableY + 5.5);
  doc.text('Cod. Fiscale', 110, tableY + 5.5);
  doc.text('Cert. Medico', 150, tableY + 5.5);
  doc.text('Recapito Telefonico', pageWidth - 23, tableY + 5.5, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  let currentY = tableY + 8;
  const rowHeight = 8;

  students.forEach((student, index) => {
    // Zebra striping
    if (index % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(20, currentY, pageWidth - 40, rowHeight, 'F');
    }

    doc.setDrawColor(240, 240, 240);
    doc.line(20, currentY + rowHeight, pageWidth - 20, currentY + rowHeight);

    doc.text(`${student.lastName} ${student.firstName}`, 23, currentY + 5.5);
    doc.text(formatDate(student.dateOfBirth), 80, currentY + 5.5);
    doc.text(student.fiscalCode || 'Non inserito', 110, currentY + 5.5);
    
    // Medical certificate status
    const med = student.medicalInfo;
    let medStr = 'Nessuno';
    if (med?.medicalClearance) {
      medStr = med.medicalClearanceExpiry ? `Scad. ${formatDate(med.medicalClearanceExpiry)}` : 'Valido';
    }
    doc.text(medStr, 150, currentY + 5.5);

    // Primary Phone
    const phone = student.contact.studentPhone || student.contact.parentPhone || 'N/D';
    doc.text(phone, pageWidth - 23, currentY + 5.5, { align: 'right' });

    currentY += rowHeight;

    // Check page overflow
    if (currentY > 260 && index < students.length - 1) {
      doc.addPage();
      currentY = 25;
      
      // Reprint header on new page
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(20, currentY, pageWidth - 40, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('Nominativo', 23, currentY + 5.5);
      doc.text('Nascita', 80, currentY + 5.5);
      doc.text('Cod. Fiscale', 110, currentY + 5.5);
      doc.text('Cert. Medico', 150, currentY + 5.5);
      doc.text('Recapito Telefonico', pageWidth - 23, currentY + 5.5, { align: 'right' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      currentY += 8;
    }
  });

  return doc;
}

export async function generateAnnualPaymentsReportPDF(
  courses: Course[],
  students: Student[],
  payments: Payment[],
  school: School,
  year: number
) {
  // Use Landscape orientation
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor: [number, number, number] = [139, 92, 246];

  let isFirstPage = true;

  courses.forEach((course) => {
    // Filter students enrolled in this course OR who have payments registered for it in this year
    const courseStudents = students.filter((s) => {
      const isEnrolled = s.enrolledCourseIds?.includes(course.id);
      const hasPayment = payments.some(
        (p) => p.studentId === s.id && p.courseId === course.id && p.year === year && p.type === 'monthly' && p.status !== 'cancelled'
      );
      return isEnrolled || hasPayment;
    });

    if (courseStudents.length === 0) return;

    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;

    // Document Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`PROSPETTO QUOTE ANNUALE ${year} - CORSO: ${course.name.toUpperCase()}`, 15, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Scuola: ${school.name} | Stile: ${course.style} | Livello: ${course.level}`, 15, 25);

    // Table Header
    const tableY = 32;
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(15, tableY, pageWidth - 30, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Allievo', 18, tableY + 5.5);

    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const startX = 80;
    const colWidth = (pageWidth - 30 - startX) / 13; // 12 months + Total

    months.forEach((m, idx) => {
      const x = startX + (idx * colWidth);
      doc.text(m, x + (colWidth / 2), tableY + 5.5, { align: 'center' });
    });
    doc.text('Totale', startX + (12 * colWidth) + (colWidth / 2), tableY + 5.5, { align: 'center' });

    // Table rows
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    let currentY = tableY + 8;
    const rowHeight = 8;

    courseStudents.forEach((student, studIndex) => {
      // Zebra striping
      if (studIndex % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(15, currentY, pageWidth - 30, rowHeight, 'F');
      }

      // Draw borders
      doc.setDrawColor(230, 230, 230);
      doc.rect(15, currentY, pageWidth - 30, rowHeight);

      // Student name
      doc.text(`${student.lastName} ${student.firstName}`, 18, currentY + 5.5);

      let studentTotalPaid = 0;

      // Check payments for each month
      for (let mIndex = 1; mIndex <= 12; mIndex++) {
        const x = startX + ((mIndex - 1) * colWidth);
        doc.line(x, currentY, x, currentY + rowHeight);

        // Find monthly payments for this student, course, month and year
        const monthlyPayment = payments.find(
          (p) =>
            p.studentId === student.id &&
            p.courseId === course.id &&
            p.type === 'monthly' &&
            p.month === mIndex &&
            p.year === year &&
            p.status !== 'cancelled'
        );

        let cellText = '-';
        if (monthlyPayment) {
          const total = monthlyPayment.totalAmount ?? monthlyPayment.amount;
          const paidVal = monthlyPayment.paidAmount ?? (monthlyPayment.status === 'paid' ? monthlyPayment.amount : 0);
          
          let status = monthlyPayment.status;
          if (status !== 'cancelled' && status !== 'paid') {
            if (paidVal >= total) status = 'paid';
            else if (paidVal > 0) status = 'deposit_paid';
          }

          if (status === 'paid') {
            cellText = `€${paidVal.toFixed(0)}`;
            studentTotalPaid += paidVal;
            doc.setTextColor(16, 185, 129); // Green
          } else if (status === 'deposit_paid') {
            cellText = `Ac. €${paidVal.toFixed(0)}`;
            studentTotalPaid += paidVal;
            doc.setTextColor(245, 158, 11); // Orange
          } else if (status === 'overdue') {
            cellText = 'Scad';
            doc.setTextColor(239, 68, 68); // Red
          } else {
            cellText = 'Att';
            doc.setTextColor(156, 163, 175); // Gray
          }
        }
        
        doc.setFont('helvetica', cellText !== '-' ? 'bold' : 'normal');
        doc.setFontSize(8);
        doc.text(cellText, x + (colWidth / 2), currentY + 5.5, { align: 'center' });
        doc.setTextColor(0, 0, 0); // Restore black
      }

      // Total column
      const totalX = startX + (12 * colWidth);
      doc.line(totalX, currentY, totalX, currentY + rowHeight);
      doc.setFont('helvetica', 'bold');
      doc.text(`€${studentTotalPaid.toFixed(0)}`, totalX + (colWidth / 2), currentY + 5.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      currentY += rowHeight;

      // Handle page break for students inside the course
      if (currentY > pageHeight - 20 && studIndex < courseStudents.length - 1) {
        doc.addPage();
        currentY = 20;

        // Reprint table header
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(15, currentY, pageWidth - 30, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('Allievo', 18, currentY + 5.5);
        months.forEach((m, idx) => {
          const x = startX + (idx * colWidth);
          doc.text(m, x + (colWidth / 2), currentY + 5.5, { align: 'center' });
        });
        doc.text('Totale', startX + (12 * colWidth) + (colWidth / 2), currentY + 5.5, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        currentY += 8;
      }
    });
  });

  return doc;
}

export async function generateFilteredPaymentsPDF(
  payments: Payment[],
  school: School,
  filters: { month: number; courseId: string; status: string },
  students: Student[],
  courses: Course[]
) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor: [number, number, number] = [139, 92, 246];

  const fiscal = getSchoolFiscalInfo(school);

  // Header School Info
  doc.setFillColor(243, 244, 246);
  doc.rect(15, 15, 25, 25, 'F');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('LOGO', 27.5, 29, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(fiscal.brandName, 45, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(fiscal.legalName, 45, 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${fiscal.fullAddress} | C.F./P.IVA: ${fiscal.taxId}`, 45, 32);

  // Report details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('REPORT RENDICONTAZIONE PAGAMENTI', pageWidth - 15, 23, { align: 'right' });
  
  // Filter description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  
  const courseName = filters.courseId === 'all' ? 'Tutti' : (courses.find(c => c.id === filters.courseId)?.name || 'N/D');
  const monthText = filters.month === 0 ? 'Tutti' : `Mese ${filters.month}`;
  const statusText = filters.status === 'all' ? 'Tutti' : filters.status.toUpperCase();
  doc.text(`Filtri: Mese: ${monthText} | Corso: ${courseName} | Stato: ${statusText}`, pageWidth - 15, 28, { align: 'right' });
  doc.text(`Generato il: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 15, 33, { align: 'right' });

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.line(15, 45, pageWidth - 15, 45);

  // Table header
  const tableY = 50;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(15, tableY, pageWidth - 30, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Allievo', 18, tableY + 5.5);
  doc.text('Descrizione', 65, tableY + 5.5);
  doc.text('Corso', 120, tableY + 5.5);
  doc.text('Dovuto', 165, tableY + 5.5, { align: 'right' });
  doc.text('Versato', 185, tableY + 5.5, { align: 'right' });
  doc.text('Residuo', 205, tableY + 5.5, { align: 'right' });
  doc.text('Stato', 220, tableY + 5.5);
  doc.text('Storico Versamenti', 242, tableY + 5.5);

  // Totals calculations
  let totalDovuto = 0;
  let totalVersato = 0;
  let totalResiduo = 0;
  let morosiCount = 0;

  // Table rows
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let currentY = tableY + 8;
  const rowHeight = 9;

  payments.forEach((p, idx) => {
    const studentObj = students.find(s => s.id === p.studentId);
    const studentName = studentObj ? `${studentObj.lastName} ${studentObj.firstName}` : 'N/D';
    const courseObj = courses.find(c => c.id === p.courseId);
    const courseNameStr = courseObj?.name || 'N/D';

    const dovuto = p.totalAmount ?? p.amount;
    const versato = p.paidAmount ?? 0;
    const residuo = p.remainingAmount ?? (dovuto - versato);

    totalDovuto += dovuto;
    totalVersato += versato;
    totalResiduo += residuo;
    if (p.status === 'overdue') {
      morosiCount++;
    }

    // Zebra striping
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(15, currentY, pageWidth - 30, rowHeight, 'F');
    }

    doc.setDrawColor(240, 240, 240);
    doc.rect(15, currentY, pageWidth - 30, rowHeight);

    // Columns texts
    doc.text(studentName, 18, currentY + 6);
    doc.text(p.description, 65, currentY + 6);
    doc.text(courseNameStr, 120, currentY + 6);
    doc.text(`€ ${dovuto.toFixed(2)}`, 165, currentY + 6, { align: 'right' });
    doc.text(`€ ${versato.toFixed(2)}`, 185, currentY + 6, { align: 'right' });
    doc.text(`€ ${residuo.toFixed(2)}`, 205, currentY + 6, { align: 'right' });
    
    const statusLabel = 
      p.status === 'paid' ? 'Saldato' : 
      p.status === 'deposit_paid' ? 'Acconto' :
      p.status === 'overdue' ? 'Scaduto' : 
      p.status === 'cancelled' ? 'Annullato' : 'Attesa';
    doc.text(statusLabel, 220, currentY + 6);

    // Storico versamenti string
    let storicoStr = '-';
    if (p.payments && p.payments.length > 0) {
      storicoStr = p.payments.map(inst => `€${inst.amount.toFixed(0)} (${formatDate(inst.date, 'dd/MM')})`).join(', ');
    }
    const truncatedStorico = storicoStr.length > 32 ? storicoStr.substring(0, 29) + '...' : storicoStr;
    doc.text(truncatedStorico, 242, currentY + 6);

    currentY += rowHeight;

    // Page overflow
    if (currentY > pageHeight - 35 && idx < payments.length - 1) {
      doc.addPage();
      currentY = 20;

      // Reprint Header
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(15, currentY, pageWidth - 30, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('Allievo', 18, currentY + 5.5);
      doc.text('Descrizione', 65, currentY + 5.5);
      doc.text('Corso', 120, currentY + 5.5);
      doc.text('Dovuto', 165, currentY + 5.5, { align: 'right' });
      doc.text('Versato', 185, currentY + 5.5, { align: 'right' });
      doc.text('Residuo', 205, currentY + 5.5, { align: 'right' });
      doc.text('Stato', 220, currentY + 5.5);
      doc.text('Storico Versamenti', 242, currentY + 5.5);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      currentY += 8;
    }
  });

  // Print Summary Cards in footer
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 20;
  }

  const boxY = currentY + 5;
  doc.setFillColor(243, 244, 246);
  doc.rect(15, boxY, pageWidth - 30, 18, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(15, boxY, pageWidth - 30, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RIEPILOGO FINANZIARIO GENERALE:', 20, boxY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Totale Dovuto: € ${totalDovuto.toFixed(2)}`, 100, boxY + 8);
  doc.text(`Totale Incassato: € ${totalVersato.toFixed(2)}`, 100, boxY + 13);
  doc.text(`Totale Residuo: € ${totalResiduo.toFixed(2)}`, 170, boxY + 8);
  doc.text(`Allievi Morosi: ${morosiCount}`, 170, boxY + 13);

  return doc;
}

export async function generateStudentHistoryPDF(
  student: Student,
  payments: Payment[],
  school: School,
  academicYear: string,
  courses: Course[]
) {
  const doc = new jsPDF({ orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor: [number, number, number] = [139, 92, 246];

  const fiscal = getSchoolFiscalInfo(school);

  // Intestazione scuola
  doc.setFillColor(243, 244, 246);
  doc.rect(20, 20, 25, 25, 'F');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('LOGO', 32.5, 34, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(fiscal.brandName, 50, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(fiscal.legalName, 50, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  doc.text(`${fiscal.fullAddress} | C.F./P.IVA: ${fiscal.taxId}`, 50, 36);

  // Line separator
  doc.setDrawColor(200, 200, 200);
  doc.line(20, 50, pageWidth - 20, 50);

  // Title report
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`RENDICONTO STORICO PAGAMENTI`, 20, 60);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Anno Accademico: ${academicYear}`, pageWidth - 20, 60, { align: 'right' });

  // Student box
  doc.setFillColor(249, 250, 251);
  doc.rect(20, 67, pageWidth - 40, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Allievo / Famiglia:', 25, 73);
  doc.setFont('helvetica', 'normal');
  doc.text(`${student.lastName} ${student.firstName}`, 25, 79);
  doc.text(`Codice Fiscale: ${student.fiscalCode || 'Non specificato'}`, 25, 85);

  // Filter payments by academicYear
  const [startYearStr, endYearStr] = academicYear.split('-');
  const startYear = parseInt(startYearStr);
  const endYear = parseInt(endYearStr);

  const studentPayments = payments.filter((p) => {
    if (p.studentId !== student.id) return false;
    if (p.status === 'cancelled') return false;

    if (p.type === 'monthly') {
      if (p.year) {
        if (p.year === startYear && p.month && p.month >= 8) return true;
        if (p.year === endYear && p.month && p.month < 8) return true;
        return p.year === startYear || p.year === endYear;
      }
    }
    
    const dueD = p.dueDate?.toDate();
    if (dueD) {
      const yr = dueD.getFullYear();
      const mo = dueD.getMonth() + 1;
      if (yr === startYear && mo >= 8) return true;
      if (yr === endYear && mo < 8) return true;
      return yr === startYear || yr === endYear;
    }
    return true;
  });

  // Table
  const tableY = 98;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(20, tableY, pageWidth - 40, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Descrizione Quota', 23, tableY + 5.5);
  doc.text('Scadenza', 80, tableY + 5.5);
  doc.text('Dovuto', 110, tableY + 5.5, { align: 'right' });
  doc.text('Versato', 130, tableY + 5.5, { align: 'right' });
  doc.text('Residuo', 150, tableY + 5.5, { align: 'right' });
  doc.text('Stato', 157, tableY + 5.5);

  let totalDovuto = 0;
  let totalVersato = 0;
  let totalResiduo = 0;

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  let currentY = tableY + 8;
  const rowHeight = 9;

  studentPayments.forEach((p, idx) => {
    const dovuto = p.totalAmount ?? p.amount;
    const versato = p.paidAmount ?? 0;
    const residuo = p.remainingAmount ?? (dovuto - versato);

    totalDovuto += dovuto;
    totalVersato += versato;
    totalResiduo += residuo;

    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(20, currentY, pageWidth - 40, rowHeight, 'F');
    }

    doc.setDrawColor(240, 240, 240);
    doc.rect(20, currentY, pageWidth - 40, rowHeight);

    const courseObj = courses?.find(c => c.id === p.courseId);
    const descText = courseObj ? `${p.description} (${courseObj.name})` : p.description;
    doc.text(descText, 23, currentY + 6);
    doc.text(formatDate(p.dueDate), 80, currentY + 6);
    doc.text(`€ ${dovuto.toFixed(2)}`, 110, currentY + 6, { align: 'right' });
    doc.text(`€ ${versato.toFixed(2)}`, 130, currentY + 6, { align: 'right' });
    doc.text(`€ ${residuo.toFixed(2)}`, 150, currentY + 6, { align: 'right' });

    let statusText = 'Attesa';
    if (p.status === 'paid') {
      statusText = 'Saldato';
      doc.setTextColor(16, 185, 129);
    } else if (p.status === 'deposit_paid') {
      statusText = 'Acconto';
      doc.setTextColor(245, 158, 11);
    } else if (p.status === 'overdue') {
      statusText = 'Scaduto';
      doc.setTextColor(239, 68, 68);
    } else {
      doc.setTextColor(100, 100, 100);
    }
    
    doc.setFont('helvetica', 'bold');
    doc.text(statusText, 157, currentY + 6);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    currentY += rowHeight;

    if (currentY > pageHeight - 45 && idx < studentPayments.length - 1) {
      doc.addPage();
      currentY = 25;
      
      // Reprint header
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(20, currentY, pageWidth - 40, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('Descrizione Quota', 23, currentY + 5.5);
      doc.text('Scadenza', 80, currentY + 5.5);
      doc.text('Dovuto', 110, currentY + 5.5, { align: 'right' });
      doc.text('Versato', 130, currentY + 5.5, { align: 'right' });
      doc.text('Residuo', 150, currentY + 5.5, { align: 'right' });
      doc.text('Stato', 157, currentY + 5.5);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      currentY += 8;
    }
  });

  // Summary box
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = 25;
  }

  const boxY = currentY + 8;
  doc.setFillColor(243, 244, 246);
  doc.rect(20, boxY, pageWidth - 40, 22, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(20, boxY, pageWidth - 40, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RIEPILOGO E SALDO FINALE:', 25, boxY + 13);

  doc.setFontSize(9.5);
  doc.text(`Totale Dovuto: € ${totalDovuto.toFixed(2)}`, 90, boxY + 9);
  doc.text(`Totale Pagato: € ${totalVersato.toFixed(2)}`, 90, boxY + 16);
  
  doc.setFont('helvetica', 'bold');
  if (totalResiduo > 0) {
    doc.setTextColor(239, 68, 68);
  } else {
    doc.setTextColor(16, 185, 129);
  }
  doc.text(`DEBITO RESIDUO: € ${totalResiduo.toFixed(2)}`, 142, boxY + 13);
  doc.setTextColor(0, 0, 0);

  // Footer notes
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Estratto conto generato il ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, pageHeight - 15, { align: 'center' });

  return doc;
}
