import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { Course, Student, School } from '@/types';

const MONTH_NAMES = [
  'SET', 'OTT', 'NOV', 'DIC', 'GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU'
];

interface SecretaryRegistryOptions {
  students: Student[];
  courses: Course[];
  school?: School | null;
  academicYear?: string;
  emptyRowsCount?: number;
}

/**
 * Genera il Registro Generale Incassi & Quote Segreteria in formato A4 Orizzontale (Landscape).
 * Contiene l'elenco alfabetico unico di tutte le allieve attive (nessun duplicato),
 * con l'indicazione di tutti i corsi frequentati, la quota complessiva e le 10 caselle mensili.
 */
export function generateSecretaryPaymentsRegistryPDF(options: SecretaryRegistryOptions): jsPDF {
  const {
    students,
    courses,
    school,
    academicYear = '2025/2026',
    emptyRowsCount = 10,
  } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 10;
  const marginTop = 10;
  const contentWidth = pageWidth - marginX * 2; // 277mm

  // Palette Colori Tropical Style
  const brandPurple: [number, number, number] = [124, 58, 237]; // #7c3aed
  const headerBg: [number, number, number] = [245, 246, 252];
  const darkText: [number, number, number] = [25, 23, 40];
  const grayText: [number, number, number] = [100, 105, 125];
  const borderLine: [number, number, number] = [205, 210, 225];
  const rowAltBg: [number, number, number] = [252, 253, 255];

  // Filtra e ordina alfabeticamente gli allievi attivi
  const activeStudents = students
    .filter((s) => !s.isDeleted && s.isActive)
    .sort((a, b) => {
      const lastCmp = a.lastName.localeCompare(b.lastName, 'it');
      if (lastCmp !== 0) return lastCmp;
      return a.firstName.localeCompare(b.firstName, 'it');
    });

  // Mappa corsi per rapido lookup
  const courseMap = new Map<string, Course>();
  courses.forEach((c) => courseMap.set(c.id, c));

  // Helper per calcolare i corsi e la quota di un allievo
  const getStudentInfo = (st: Student) => {
    const enrolledCourseNames: string[] = [];
    let calculatedFee = 0;

    (st.enrolledCourseIds || []).forEach((cId) => {
      const c = courseMap.get(cId);
      if (c && c.isActive && !c.isDeleted) {
        enrolledCourseNames.push(c.name);
        if (c.fee?.monthly) {
          calculatedFee += c.fee.monthly;
        }
      }
    });

    const coursesText = enrolledCourseNames.length > 0
      ? enrolledCourseNames.join(' + ')
      : 'Nessun corso attivo';

    const feeText = st.customMonthlyFee !== undefined && st.customMonthlyFee !== null
      ? `€ ${st.customMonthlyFee}`
      : calculatedFee > 0
        ? `€ ${calculatedFee}`
        : '—';

    return { coursesText, feeText };
  };

  // Dimensioni Colonne (Totale = 277mm)
  const colWidths = {
    num: 9,
    name: 52,
    courses: 50,
    fee: 18,
    month: 11.8, // 10 x 11.8 = 118mm
    notes: 30,
  };

  const rowsPerPage = 17;
  const rowHeight = 7.5;
  const allRowsCount = activeStudents.length + emptyRowsCount;
  const totalPages = Math.ceil(allRowsCount / rowsPerPage) || 1;

  let studentIdx = 0;
  let emptyRowsInserted = 0;

  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) {
      doc.addPage('a4', 'landscape');
    }

    // ── 1. HEADER BRAND SUPERIORE ──
    doc.setFillColor(brandPurple[0], brandPurple[1], brandPurple[2]);
    doc.rect(marginX, marginTop, contentWidth, 3, 'F');

    // Titolo Scuola
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
    doc.text(
      school?.name ? school.name.toUpperCase() : 'TROPICAL STYLE CARIBBEAN SCHOOL',
      marginX,
      marginTop + 8
    );

    // Titolo Documento
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(
      'REGISTRO GENERALE INCASSI & QUOTE MENSILE SEGRETERIA',
      marginX,
      marginTop + 13
    );

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    doc.text(
      'Elenco Alfabetico Unico Allieve · Ogni allieva è registrata una sola volta con il riepilogo delle quote',
      marginX,
      marginTop + 17
    );

    // Box Info Destra (Anno, Data e Paginazione)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
    doc.text(`ANNO ACCADEMICO ${academicYear}`, pageWidth - marginX, marginTop + 8, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    doc.text(`Totale Allieve: ${activeStudents.length} · Pagina ${page} di ${totalPages}`, pageWidth - marginX, marginTop + 13, { align: 'right' });
    doc.text(`Data Stampa: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - marginX, marginTop + 17, { align: 'right' });

    // ── 2. INTESTAZIONE TABELLA (THEAD) ──
    const tableTopY = marginTop + 20;
    const thHeight = 10;

    doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginX, tableTopY, contentWidth, thHeight, 'FD');

    let thX = marginX;

    // Colonna N°
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text('N°', thX + colWidths.num / 2, tableTopY + 6.5, { align: 'center' });
    doc.line(thX + colWidths.num, tableTopY, thX + colWidths.num, tableTopY + thHeight);
    thX += colWidths.num;

    // Colonna Allieva
    doc.text('ALLIEVA (COGNOME E NOME)', thX + 3, tableTopY + 6.5);
    doc.line(thX + colWidths.name, tableTopY, thX + colWidths.name, tableTopY + thHeight);
    thX += colWidths.name;

    // Colonna Corsi Frequentati
    doc.text('DISCIPLINE / CORSI', thX + 3, tableTopY + 6.5);
    doc.line(thX + colWidths.courses, tableTopY, thX + colWidths.courses, tableTopY + thHeight);
    thX += colWidths.courses;

    // Colonna Quota Totale
    doc.text('RETTA', thX + colWidths.fee / 2, tableTopY + 6.5, { align: 'center' });
    doc.line(thX + colWidths.fee, tableTopY, thX + colWidths.fee, tableTopY + thHeight);
    thX += colWidths.fee;

    // 10 Mesi (SET - GIU)
    MONTH_NAMES.forEach((mName) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
      doc.text(mName, thX + colWidths.month / 2, tableTopY + 6.5, { align: 'center' });
      doc.line(thX + colWidths.month, tableTopY, thX + colWidths.month, tableTopY + thHeight);
      thX += colWidths.month;
    });

    // Note / Saldo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text('NOTE / SALDO', thX + colWidths.notes / 2, tableTopY + 6.5, { align: 'center' });

    // ── 3. RIGHE DATI ──
    let currentY = tableTopY + thHeight;

    for (let r = 0; r < rowsPerPage; r++) {
      if (studentIdx < activeStudents.length) {
        // Riga Allievo Effettivo
        const st = activeStudents[studentIdx];
        const isEven = studentIdx % 2 === 1;

        if (isEven) {
          doc.setFillColor(rowAltBg[0], rowAltBg[1], rowAltBg[2]);
          doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');
        }

        doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
        doc.setLineWidth(0.2);
        doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

        let cellX = marginX;

        // N°
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(grayText[0], grayText[1], grayText[2]);
        doc.text(String(studentIdx + 1), cellX + colWidths.num / 2, currentY + 5, { align: 'center' });
        doc.line(cellX + colWidths.num, currentY, cellX + colWidths.num, currentY + rowHeight);
        cellX += colWidths.num;

        // Cognome e Nome (MAIUSCOLO)
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        const fullName = `${st.lastName.toUpperCase()} ${st.firstName.toUpperCase()}`;
        const truncatedName = fullName.length > 25 ? fullName.substring(0, 23) + '...' : fullName;
        doc.text(truncatedName, cellX + 2.5, currentY + 5);
        doc.line(cellX + colWidths.name, currentY, cellX + colWidths.name, currentY + rowHeight);
        cellX += colWidths.name;

        // Corsi Frequentati
        const { coursesText, feeText } = getStudentInfo(st);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(grayText[0], grayText[1], grayText[2]);
        const truncatedCourses = coursesText.length > 30 ? coursesText.substring(0, 28) + '...' : coursesText;
        doc.text(truncatedCourses, cellX + 2, currentY + 5);
        doc.line(cellX + colWidths.courses, currentY, cellX + colWidths.courses, currentY + rowHeight);
        cellX += colWidths.courses;

        // Retta (€)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(brandPurple[0], brandPurple[1], brandPurple[2]);
        doc.text(feeText, cellX + colWidths.fee / 2, currentY + 5, { align: 'center' });
        doc.line(cellX + colWidths.fee, currentY, cellX + colWidths.fee, currentY + rowHeight);
        cellX += colWidths.fee;

        // 10 Mesi con Caselline per spunta / importo a penna
        MONTH_NAMES.forEach(() => {
          doc.setDrawColor(220, 224, 235);
          doc.setLineWidth(0.15);
          const boxSize = 4.8;
          const boxLeft = cellX + (colWidths.month - boxSize) / 2;
          const boxTop = currentY + (rowHeight - boxSize) / 2;
          doc.rect(boxLeft, boxTop, boxSize, boxSize);

          doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
          doc.setLineWidth(0.2);
          doc.line(cellX + colWidths.month, currentY, cellX + colWidths.month, currentY + rowHeight);
          cellX += colWidths.month;
        });

        // Note
        doc.line(cellX + colWidths.notes, currentY, cellX + colWidths.notes, currentY + rowHeight);

        currentY += rowHeight;
        studentIdx++;
      } else if (emptyRowsInserted < emptyRowsCount) {
        // Riga Extra Vuota per annotazioni a penna
        doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
        doc.setLineWidth(0.2);
        doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

        let cellX = marginX;

        // N°
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(grayText[0], grayText[1], grayText[2]);
        doc.text(String(activeStudents.length + emptyRowsInserted + 1), cellX + colWidths.num / 2, currentY + 5, { align: 'center' });
        doc.line(cellX + colWidths.num, currentY, cellX + colWidths.num, currentY + rowHeight);
        cellX += colWidths.num;

        // Nome vuoto con linea puntinata di guida
        doc.setDrawColor(230, 233, 245);
        doc.line(cellX + 2, currentY + 5.5, cellX + colWidths.name - 2, currentY + 5.5);
        doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
        doc.line(cellX + colWidths.name, currentY, cellX + colWidths.name, currentY + rowHeight);
        cellX += colWidths.name;

        // Corsi vuoti
        doc.setDrawColor(230, 233, 245);
        doc.line(cellX + 2, currentY + 5.5, cellX + colWidths.courses - 2, currentY + 5.5);
        doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
        doc.line(cellX + colWidths.courses, currentY, cellX + colWidths.courses, currentY + rowHeight);
        cellX += colWidths.courses;

        // Quota
        doc.line(cellX + colWidths.fee, currentY, cellX + colWidths.fee, currentY + rowHeight);
        cellX += colWidths.fee;

        // 10 Mesi caselline
        MONTH_NAMES.forEach(() => {
          doc.setDrawColor(220, 224, 235);
          doc.setLineWidth(0.15);
          const boxSize = 4.8;
          const boxLeft = cellX + (colWidths.month - boxSize) / 2;
          const boxTop = currentY + (rowHeight - boxSize) / 2;
          doc.rect(boxLeft, boxTop, boxSize, boxSize);

          doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
          doc.setLineWidth(0.2);
          doc.line(cellX + colWidths.month, currentY, cellX + colWidths.month, currentY + rowHeight);
          cellX += colWidths.month;
        });

        // Note
        doc.line(cellX + colWidths.notes, currentY, cellX + colWidths.notes, currentY + rowHeight);

        currentY += rowHeight;
        emptyRowsInserted++;
      } else {
        break;
      }
    }

    // Bordo perimetrale esterno della tabella
    doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginX, tableTopY, contentWidth, currentY - tableTopY);

    // ── 4. FOOTER NOTE LEGALI & SEGRETERIA ──
    const footerY = 202;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    doc.text(
      'Documento interno riservato alla Segreteria Tropical Style Caribbean School · Per ogni allieva annotare la data o la spunta del pagamento mensile.',
      marginX,
      footerY
    );
  }

  return doc;
}
