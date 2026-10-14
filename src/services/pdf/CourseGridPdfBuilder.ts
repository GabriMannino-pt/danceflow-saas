import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { Course, Student, School } from '@/types';

const MONTH_NAMES = [
  'SET', 'OTT', 'NOV', 'DIC', 'GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU'
];

interface CourseGridOptions {
  course: Course;
  students: Student[];
  school?: School | null;
  teacherName?: string;
  academicYear?: string;
  emptyRowsCount?: number;
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
    academicYear = '2025/2026',
    emptyRowsCount = 5,
  } = options;

  if (!isFirstPage) {
    doc.addPage('a4', 'landscape');
  }

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 12;
  const marginTop = 12;
  const contentWidth = pageWidth - marginX * 2; // 273mm

  // Palette Colori Tropical Style
  const brandPurple: [number, number, number] = [124, 58, 237]; // #7c3aed
  const headerBg: [number, number, number] = [248, 249, 252];
  const darkText: [number, number, number] = [30, 27, 46];
  const grayText: [number, number, number] = [100, 105, 125];
  const borderLine: [number, number, number] = [205, 210, 225];
  const rowAltBg: [number, number, number] = [252, 253, 255];

  // ── 1. HEADER SCUOLA & REGISTRO ──
  // Fascia decorativa superiore brand
  doc.setFillColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.rect(marginX, marginTop, contentWidth, 3, 'F');

  // Titolo Scuola
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.text(school?.name ? school.name.toUpperCase() : 'TROPICAL STYLE CARIBBEAN SCHOOL', marginX, marginTop + 10);

  // Titolo Documento
  doc.setFontSize(10);
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

  const tableTopY = courseBoxY + courseBoxHeight + 4;
  const tableHeaderHeight = 9;

  // Header Tabella Sfondo
  doc.setFillColor(brandPurple[0], brandPurple[1], brandPurple[2]);
  doc.rect(marginX, tableTopY, contentWidth, tableHeaderHeight, 'F');

  // Testi Header Tabella
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  let currentX = marginX;

  // Colonna N°
  doc.text('N°', currentX + colWidths.num / 2, tableTopY + 5.5, { align: 'center' });
  currentX += colWidths.num;

  // Colonna Allieva
  doc.text('ALLIEVA (Cognome e Nome)', currentX + 3, tableTopY + 5.5);
  currentX += colWidths.name;

  // Colonne 10 Mesi
  MONTH_NAMES.forEach((mName) => {
    doc.text(mName, currentX + colWidths.month / 2, tableTopY + 5.5, { align: 'center' });
    currentX += colWidths.month;
  });

  // Colonna Quota
  doc.text('QUOTA', currentX + colWidths.fee / 2, tableTopY + 5.5, { align: 'center' });
  currentX += colWidths.fee;

  // Colonna Note
  doc.text('NOTE / SALDO', currentX + 3, tableTopY + 5.5);

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
    // Tronca se troppo lungo
    const truncatedName = fullName.length > 28 ? fullName.substring(0, 26) + '...' : fullName;
    doc.text(truncatedName, cellX + 2.5, currentY + 5);
    doc.line(cellX + colWidths.name, currentY, cellX + colWidths.name, currentY + rowHeight);
    cellX += colWidths.name;

    // 10 Mesi con caselline quadrate per spunta / importo
    MONTH_NAMES.forEach(() => {
      // Casellina centrale per spunta o firma a penna
      doc.setDrawColor(220, 224, 235);
      doc.setLineWidth(0.15);
      const boxSize = 5.2;
      const boxLeft = cellX + (colWidths.month - boxSize) / 2;
      const boxTop = currentY + (rowHeight - boxSize) / 2;
      doc.rect(boxLeft, boxTop, boxSize, boxSize);

      // Linea divisoria verticale
      doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
      doc.setLineWidth(0.2);
      doc.line(cellX + colWidths.month, currentY, cellX + colWidths.month, currentY + rowHeight);
      cellX += colWidths.month;
    });

    // Quota (€)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    const feeText = course.fee?.monthly ? `€ ${course.fee.monthly},00` : '—';
    doc.text(feeText, cellX + colWidths.fee / 2, currentY + 5, { align: 'center' });
    doc.line(cellX + colWidths.fee, currentY, cellX + colWidths.fee, currentY + rowHeight);
    cellX += colWidths.fee;

    // Note (vuoto per note a penna della segreteria)
    doc.line(cellX + colWidths.notes, currentY, cellX + colWidths.notes, currentY + rowHeight);

    currentY += rowHeight;
  });

  // ── 5. RIGHE EXTRA VUOTE (PER ALLIEVI DI PROVA O NUOVI INGRESSI A PENNA) ──
  const startEmptyIdx = enrolledStudents.length + 1;
  for (let e = 0; e < emptyRowsCount; e++) {
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
    MONTH_NAMES.forEach(() => {
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
    `Totale Allieve Iscritte: ${enrolledStudents.length}  |  Spazio per ${emptyRowsCount} ingressi prova/manuali  |  Registro Ufficiale Tropical Style Caribbean School`,
    marginX,
    footerY
  );
  doc.text('Firma Segreteria: ________________________________', pageWidth - marginX, footerY, { align: 'right' });
}

/**
 * Genera il PDF del registro per un SINGOLO corso
 */
export function generateCourseAttendanceGridPDF(
  course: Course,
  students: Student[],
  school?: School | null,
  teacherName?: string,
  academicYear: string = '2025/2026'
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
  }, true);

  return doc;
}

/**
 * Genera un unico PDF multipagina con TUTTI i corsi attivi fascicolati
 */
export function generateAllCoursesAttendanceGridPDF(
  courses: Course[],
  students: Student[],
  school?: School | null,
  teachersMap: Record<string, string> = {},
  academicYear: string = '2025/2026'
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
      },
      idx === 0 // la prima pagina non usa addPage
    );
  });

  return doc;
}
