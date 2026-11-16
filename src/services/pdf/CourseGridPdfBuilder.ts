import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { Course, Student, School, Payment } from '@/types';
import { getSchoolFiscalInfo } from '@/lib/pdf';

export const ACADEMIC_MONTHS = [
  { label: 'SET', month: 9 },
  { label: 'OTT', month: 10 },
  { label: 'NOV', month: 11 },
  { label: 'DIC', month: 12 },
  { label: 'GEN', month: 1 },
  { label: 'FEB', month: 2 },
  { label: 'MAR', month: 3 },
  { label: 'APR', month: 4 },
  { label: 'MAG', month: 5 },
  { label: 'GIU', month: 6 },
] as const;

export interface MonthPaymentStatus {
  status: 'paid' | 'partial' | 'unpaid';
  paidAmount: number;
  receiptNumber?: string;
}

/**
 * Calcola lo stato di pagamento di un allievo per una determinata mensilità.
 * Supporta ricevute multi-mese (p.months) e allievi iscritti a più corsi (quota unica mensile).
 */
export function getStudentMonthPaymentStatus(
  studentId: string,
  monthNum: number,
  payments: Payment[] = [],
  academicYear?: string
): MonthPaymentStatus {
  let startYear: number | null = null;
  let endYear: number | null = null;
  if (academicYear && academicYear.includes('/')) {
    const parts = academicYear.split('/');
    const parsedStart = parseInt(parts[0], 10);
    const parsedEnd = parseInt(parts[1], 10);
    if (!isNaN(parsedStart) && !isNaN(parsedEnd)) {
      startYear = parsedStart;
      endYear = parsedEnd;
    }
  }

  const matching = payments.filter((p) => {
    if (p.studentId !== studentId || p.status === 'cancelled' || p.type !== 'monthly') return false;
    const monthsList: number[] = (p as any).months && Array.isArray((p as any).months) && (p as any).months.length > 0
      ? (p as any).months
      : (p.month ? [p.month] : []);
    if (!monthsList.includes(monthNum)) return false;

    if (startYear && endYear && p.year) {
      if (monthNum >= 8) {
        return p.year === startYear;
      } else {
        if (p.year === endYear) return true;
        // Prepagamento primaverile registrato nell'anno di inizio stagione (es. pagato a Nov/Dic dimenticando il selettore anno)
        if (p.year === startYear) {
          const refDate = p.paidAt?.toDate?.() || p.dueDate?.toDate?.() || p.createdAt?.toDate?.();
          if (!refDate) return true;
          return refDate >= new Date(startYear, 7, 1);
        }
        return false;
      }
    }
    return true;
  });

  if (matching.length === 0) return { status: 'unpaid', paidAmount: 0 };

  let totalPaidForMonth = 0;
  let isFullyPaid = false;
  let receiptNumber: string | undefined;

  for (const p of matching) {
    const monthsCount = (p as any).months && Array.isArray((p as any).months) && (p as any).months.length > 0
      ? (p as any).months.length
      : 1;
    const rawPaid = p.paidAmount ?? (p.status === 'paid' ? p.amount : 0);
    const perMonthPaid = rawPaid / monthsCount;
    totalPaidForMonth += perMonthPaid;

    if (p.status === 'paid' || (p.remainingAmount !== undefined && p.remainingAmount <= 0 && rawPaid > 0)) {
      isFullyPaid = true;
    }
    if (p.receiptNumber) {
      receiptNumber = String(p.receiptNumber);
    }
  }

  if (isFullyPaid) {
    return { status: 'paid', paidAmount: Math.round(totalPaidForMonth * 100) / 100, receiptNumber };
  }
  if (totalPaidForMonth > 0) {
    return { status: 'partial', paidAmount: Math.round(totalPaidForMonth * 100) / 100, receiptNumber };
  }
  return { status: 'unpaid', paidAmount: 0 };
}

/**
 * Verifica se l'allievo ha saldato la quota di iscrizione / tesseramento annuale.
 */
export function hasStudentPaidRegistration(studentId: string, payments: Payment[] = []): boolean {
  return payments.some(
    (p) => p.studentId === studentId && p.type === 'registration' && p.status === 'paid'
  );
}

interface CourseGridOptions {
  course: Course;
  students: Student[];
  school?: School | null;
  teacherName?: string;
  academicYear?: string;
  emptyRowsCount?: number;
  payments?: Payment[];
}

export function getCurrentAcademicYearString(): string {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}

/**
 * Disegna una singola griglia corso in orientamento A4 Landscape (297 x 210 mm)
 */
export function buildCourseGridPage(
  doc: jsPDF,
  options: CourseGridOptions,
  isFirstPage: boolean = true
) {
  const {
    course,
    students,
    school,
    teacherName,
    academicYear = getCurrentAcademicYearString(),
    emptyRowsCount = 5,
    payments = [],
  } = options;

  if (!isFirstPage) {
    doc.addPage('a4', 'landscape');
  }

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 12;
  const marginTop = 12;
  const contentWidth = pageWidth - marginX * 2; // 273mm

  // Palette Colori Tropical Style / Latin Group
  const brandPurple: [number, number, number] = [124, 58, 237]; // #7c3aed
  const headerBg: [number, number, number] = [248, 249, 252];
  const darkText: [number, number, number] = [30, 27, 46];
  const grayText: [number, number, number] = [100, 105, 125];
  const borderLine: [number, number, number] = [205, 210, 225];
  const rowAltBg: [number, number, number] = [252, 253, 255];

  const fiscal = getSchoolFiscalInfo(school);

  // ── 1. HEADER SCUOLA & REGISTRO ──
  // Fascia decorativa superiore brand
  doc.setFillColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.rect(marginX, marginTop, contentWidth, 3, 'F');

  // Titolo Scuola
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.text(`${fiscal.legalName.toUpperCase()} · ${fiscal.brandName.toUpperCase()}`, marginX, marginTop + 10);

  // Titolo Documento
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text('REGISTRO MENSILE SEGRETERIA & CONTROLLO QUOTE', marginX, marginTop + 15);

  // Informazioni Destra (Anno e Data di Stampa)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.text(`ANNO ACCADEMICO ${academicYear}`, pageWidth - marginX, marginTop + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(grayText[0], grayText[1], grayText[2]);
  doc.text(`Data Stampa: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - marginX, marginTop + 15, { align: 'right' });

  // ── 2. BOX INFORMATIVO CORSO ──
  const courseBoxY = marginTop + 18;
  const courseBoxHeight = 14;
  doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, courseBoxY, contentWidth, courseBoxHeight, 2, 2, 'FD');

  // Dettagli Corso nel Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.text(`CORSO: ${course.name.toUpperCase()}`, marginX + 4, courseBoxY + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);

  const teacherDisplay = teacherName || (course.teacherIds && course.teacherIds.length > 0 ? 'Insegnante Assegnato' : 'Direzione Tropical Style');
  doc.text(`Insegnante: `, marginX + 4, courseBoxY + 11);
  doc.setFont('helvetica', 'bold');
  doc.text(teacherDisplay, marginX + 22, courseBoxY + 11);

  doc.setFont('helvetica', 'normal');
  doc.text(`Livello / Stile: `, marginX + 85, courseBoxY + 11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${course.level || 'Unico'} · ${course.style || 'Caraibico'}`, marginX + 106, courseBoxY + 11);

  const dayMap: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Gio', 5: 'Ven', 6: 'Sab', 0: 'Dom' };
  const scheduleText = course.schedule && course.schedule.length > 0
    ? course.schedule.map((s) => `${dayMap[s.dayOfWeek] || 'Giorno'} ${s.startTime}-${s.endTime}`).join(' | ')
    : 'Orario da calendario';
  doc.setFont('helvetica', 'normal');
  doc.text(`Orari & Sala: `, marginX + 160, courseBoxY + 11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${scheduleText} ${course.room ? `(${course.room})` : ''}`, marginX + 182, courseBoxY + 11);

  const feeMonthly = course.fee?.monthly ? `€ ${course.fee.monthly}/mese` : 'Standard';
  doc.text(`Quota: `, pageWidth - marginX - 35, courseBoxY + 11);
  doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.text(feeMonthly, pageWidth - marginX - 22, courseBoxY + 11);

  // ── 3. STRUTTURA TABELLA (COLONNE) ──
  // Larghezze millimetriche:
  // N: 9, Allieva: 56, 10 Mesi x 14.5 = 145, Quota: 25, Note/Saldo: 38  --> Totale: 273mm
  const colWidths = {
    num: 9,
    name: 56,
    month: 14.5,
    fee: 25,
    notes: 38,
  };

  const drawTableHeader = (yPos: number) => {
    doc.setFillColor(brandPurple[0], brandPurple[1], brandPurple[2]);
    doc.rect(marginX, yPos, contentWidth, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    let cx = marginX;
    doc.text('N°', cx + colWidths.num / 2, yPos + 5.5, { align: 'center' });
    cx += colWidths.num;
    doc.text('ALLIEVO/A (Cognome e Nome)', cx + 3, yPos + 5.5);
    cx += colWidths.name;
    ACADEMIC_MONTHS.forEach((mObj) => {
      doc.text(mObj.label, cx + colWidths.month / 2, yPos + 5.5, { align: 'center' });
      cx += colWidths.month;
    });
    doc.text('QUOTA', cx + colWidths.fee / 2, yPos + 5.5, { align: 'center' });
    cx += colWidths.fee;
    doc.text('NOTE / ISCR.', cx + 3, yPos + 5.5);
  };

  let tableTopY = courseBoxY + courseBoxHeight + 4;
  const tableHeaderHeight = 9;
  drawTableHeader(tableTopY);

  // ── 4. RIGHE ALLIEVE ──
  const enrolledStudents = students
    .filter((s) => !s.isDeleted && s.isActive && s.enrolledCourseIds?.includes(course.id))
    .sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName, 'it');
      return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName, 'it');
    });

  const rowHeight = 7.8;
  let currentY = tableTopY + tableHeaderHeight;

  // Disegno allieve iscritte
  enrolledStudents.forEach((st, idx) => {
    if (currentY > pageHeight - 25) {
      doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
      doc.setLineWidth(0.4);
      doc.rect(marginX, tableTopY, contentWidth, currentY - tableTopY);

      doc.addPage('a4', 'landscape');
      tableTopY = marginTop;
      drawTableHeader(tableTopY);
      currentY = tableTopY + tableHeaderHeight;
    }

    // Sfondo alternato per massima leggibilità cartacea
    if (idx % 2 === 1) {
      doc.setFillColor(rowAltBg[0], rowAltBg[1], rowAltBg[2]);
      doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');
    }

    // Bordo orizzontale inferiore
    doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

    let cellX = marginX;

    // N°
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    doc.text(String(idx + 1), cellX + colWidths.num / 2, currentY + 5, { align: 'center' });
    doc.line(cellX + colWidths.num, currentY, cellX + colWidths.num, currentY + rowHeight);
    cellX += colWidths.num;

    // Nome Allieva
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    const fullName = `${st.lastName.toUpperCase()} ${st.firstName.toUpperCase()}`;
    const truncatedName = fullName.length > 28 ? fullName.substring(0, 26) + '...' : fullName;
    doc.text(truncatedName, cellX + 2.5, currentY + 5);
    doc.line(cellX + colWidths.name, currentY, cellX + colWidths.name, currentY + rowHeight);
    cellX += colWidths.name;

    // 10 Mesi con stato pagamento reale OPPURE casella vuota per banco
    ACADEMIC_MONTHS.forEach((mObj) => {
      const mStatus = getStudentMonthPaymentStatus(st.id, mObj.month, payments, academicYear);

      if (mStatus.status === 'paid') {
        doc.setFillColor(220, 252, 231); // Verde chiaro leggibile anche in stampa B/N
        doc.rect(cellX + 0.5, currentY + 0.5, colWidths.month - 1, rowHeight - 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(5, 150, 105);
        doc.text('PAGATO', cellX + colWidths.month / 2, currentY + 5, { align: 'center' });
      } else if (mStatus.status === 'partial') {
        doc.setFillColor(254, 243, 199); // Ambra chiaro
        doc.rect(cellX + 0.5, currentY + 0.5, colWidths.month - 1, rowHeight - 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.8);
        doc.setTextColor(180, 83, 9);
        const label = mStatus.paidAmount > 0 ? `ACC. €${Math.round(mStatus.paidAmount)}` : 'ACC.';
        doc.text(label, cellX + colWidths.month / 2, currentY + 5, { align: 'center' });
      } else {
        // Casellina vuota pronta per spunta a penna in segreteria
        doc.setDrawColor(220, 224, 235);
        doc.setLineWidth(0.15);
        const boxSize = 5.2;
        const boxLeft = cellX + (colWidths.month - boxSize) / 2;
        const boxTop = currentY + (rowHeight - boxSize) / 2;
        doc.rect(boxLeft, boxTop, boxSize, boxSize);
      }

      // Linea divisoria verticale
      doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
      doc.setLineWidth(0.2);
      doc.line(cellX + colWidths.month, currentY, cellX + colWidths.month, currentY + rowHeight);
      cellX += colWidths.month;
    });

    // Quota effettiva (€) - Rispetta eventuale quota personalizzata allievo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    const effectiveFee =
      st.customMonthlyFee !== undefined && st.customMonthlyFee !== null
        ? st.customMonthlyFee
        : course.fee?.monthly;
    const feeText = effectiveFee ? `€ ${effectiveFee},00` : '—';
    doc.text(feeText, cellX + colWidths.fee / 2, currentY + 5, { align: 'center' });
    doc.line(cellX + colWidths.fee, currentY, cellX + colWidths.fee, currentY + rowHeight);
    cellX += colWidths.fee;

    // Note / Stato Iscrizione Annuale
    if (payments.length > 0 && hasStudentPaidRegistration(st.id, payments)) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(5, 150, 105);
      doc.text('Iscr. OK', cellX + 2.5, currentY + 5);
    }
    doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
    doc.line(cellX + colWidths.notes, currentY, cellX + colWidths.notes, currentY + rowHeight);

    currentY += rowHeight;
  });

  // ── 5. RIGHE EXTRA VUOTE (PER ALLIEVI DI PROVA O NUOVI INGRESSI A PENNA) ──
  const startEmptyIdx = enrolledStudents.length + 1;
  for (let e = 0; e < emptyRowsCount; e++) {
    if (currentY > pageHeight - 20) break;
    const rowNum = startEmptyIdx + e;

    doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

    let cellX = marginX;

    // N°
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    doc.text(String(rowNum), cellX + colWidths.num / 2, currentY + 5, { align: 'center' });
    doc.line(cellX + colWidths.num, currentY, cellX + colWidths.num, currentY + rowHeight);
    cellX += colWidths.num;

    // Nome vuoto con linea puntinata di guida per scrivere a penna
    doc.setDrawColor(215, 220, 235);
    doc.setLineDashPattern([0.8, 1.2], 0);
    doc.line(cellX + 2, currentY + 5.5, cellX + colWidths.name - 3, currentY + 5.5);
    doc.setLineDashPattern([], 0); // Reset tratteggio

    doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
    doc.line(cellX + colWidths.name, currentY, cellX + colWidths.name, currentY + rowHeight);
    cellX += colWidths.name;

    // 10 Mesi con caselline
    ACADEMIC_MONTHS.forEach(() => {
      doc.setDrawColor(220, 224, 235);
      doc.setLineWidth(0.15);
      const boxSize = 5.2;
      const boxLeft = cellX + (colWidths.month - boxSize) / 2;
      const boxTop = currentY + (rowHeight - boxSize) / 2;
      doc.rect(boxLeft, boxTop, boxSize, boxSize);

      doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
      doc.setLineWidth(0.2);
      doc.line(cellX + colWidths.month, currentY, cellX + colWidths.month, currentY + rowHeight);
      cellX += colWidths.month;
    });

    // Quota
    doc.line(cellX + colWidths.fee, currentY, cellX + colWidths.fee, currentY + rowHeight);
    cellX += colWidths.fee;

    // Note
    doc.line(cellX + colWidths.notes, currentY, cellX + colWidths.notes, currentY + rowHeight);

    currentY += rowHeight;
  }

  // Bordo perimetrale esterno della tabella
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.setLineWidth(0.4);
  doc.rect(marginX, tableTopY, contentWidth, currentY - tableTopY);

  // ── 6. FOOTER CON RIEPILOGO E FIRMA ──
  const footerY = pageHeight - 12;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(grayText[0], grayText[1], grayText[2]);
  doc.text(
    `Totale Allievi Iscritti: ${enrolledStudents.length}  |  PAGATO = Quota già registrata  |  [ ] = Da saldare al banco  |  ${fiscal.legalName}`,
    marginX,
    footerY
  );
  doc.text('Firma Segreteria: ________________________________', pageWidth - marginX, footerY, { align: 'right' });
}

/**
 * Genera il PDF del registro per un SINGOLO corso (pre-compilato con pagamenti reali)
 */
export function generateCourseAttendanceGridPDF(
  course: Course,
  students: Student[],
  school?: School | null,
  teacherName?: string,
  academicYear: string = getCurrentAcademicYearString(),
  payments: Payment[] = []
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  buildCourseGridPage(doc, {
    course,
    students,
    school,
    teacherName,
    academicYear,
    emptyRowsCount: 5,
    payments,
  }, true);

  return doc;
}

/**
 * Genera un unico PDF multipagina con TUTTI i corsi attivi fascicolati (pre-compilati con pagamenti reali)
 */
export function generateAllCoursesAttendanceGridPDF(
  courses: Course[],
  students: Student[],
  school?: School | null,
  teachersMap: Record<string, string> = {},
  academicYear: string = getCurrentAcademicYearString(),
  payments: Payment[] = []
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const activeCourses = courses
    .filter((c) => !c.isDeleted && c.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));

  activeCourses.forEach((c, idx) => {
    const teacherName = c.teacherIds && c.teacherIds.length > 0
      ? c.teacherIds.map((tid) => teachersMap[tid] || '').filter(Boolean).join(', ')
      : undefined;

    buildCourseGridPage(
      doc,
      {
        course: c,
        students,
        school,
        teacherName,
        academicYear,
        emptyRowsCount: 5,
        payments,
      },
      idx === 0 // la prima pagina non usa addPage
    );
  });

  return doc;
}
