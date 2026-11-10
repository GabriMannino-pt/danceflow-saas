import { z } from 'zod';

// Proposed schema definition with email format validation
const getProposedStudentFormSchema = (isEditing = false) =>
  z
    .object({
      firstName: z.string().min(2, 'Il nome deve essere di almeno 2 caratteri'),
      lastName: z.string().min(2, 'Il cognome deve essere di almeno 2 caratteri'),
      dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Inserisci una data valida'),
      fiscalCode: z
        .string()
        .optional()
        .refine((val) => {
          if (!val || val === '') return true;
          return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(val);
        }, 'Formato Codice Fiscale non valido (16 caratteri alfanumerici)'),
      gender: z.enum(['M', 'F', 'Other']),
      address: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        province: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
      }),
      contact: z.object({
        studentPhone: z.string().optional(),
        studentEmail: z
          .string()
          .optional()
          .refine(
            (val) => !val || val.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
            'Formato email non valido'
          ),
        parentName: z.string().optional(),
        parentPhone: z.string().optional(),
        parentEmail: z
          .string()
          .optional()
          .refine(
            (val) => !val || val.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
            'Formato email non valido'
          ),
        parentRelation: z.enum(['madre', 'padre', 'tutore', 'altro', '']).optional(),
        emergencyContact: z.string().optional().or(z.literal('')),
        emergencyPhone: z.string().optional().or(z.literal('')),
      }),
      medicalInfo: z.object({
        allergies: z.string().optional(),
        conditions: z.string().optional(),
        medications: z.string().optional(),
        medicalClearance: z.boolean().default(false),
        medicalClearanceExpiry: z.string().optional(),
      }),
      notes: z.string().optional(),
      isActive: z.boolean().default(true),
    })
    .superRefine((data, ctx) => {
      // ─── Age calculation ───
      if (data.dateOfBirth) {
        const dob = new Date(data.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }

        // If minor (< 18), require parent info ONLY on initial registration (not when editing existing student)
        if (age < 18 && !isEditing) {
          if (!data.contact.parentName || data.contact.parentName.trim() === '') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Il nome del genitore è obbligatorio per i minorenni',
              path: ['contact', 'parentName'],
            });
          }
          if (!data.contact.parentPhone || data.contact.parentPhone.trim() === '') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Il telefono del genitore è obbligatorio per i minorenni',
              path: ['contact', 'parentPhone'],
            });
          }
          if (!data.contact.parentEmail || data.contact.parentEmail.trim() === '') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "L'email del genitore è obbligatoria per i minorenni",
              path: ['contact', 'parentEmail'],
            });
          }
          if (!data.contact.parentRelation) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'La relazione di parentela è obbligatoria per i minorenni',
              path: ['contact', 'parentRelation'],
            });
          }
        }
      }

      // ─── Medical clearance expiry ───
      if (data.medicalInfo.medicalClearance) {
        if (!data.medicalInfo.medicalClearanceExpiry || data.medicalInfo.medicalClearanceExpiry === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'La data di scadenza del certificato medico è obbligatoria',
            path: ['medicalInfo', 'medicalClearanceExpiry'],
          });
        }
      }
    });

console.log('Testing proposed fix...');

const baseData = {
  firstName: 'Mario',
  lastName: 'Rossi',
  dateOfBirth: '2010-05-15', // Minor (15-16yo)
  gender: 'M',
  address: { street: '', city: '', province: '', postalCode: '', country: 'Italia' },
  contact: {
    studentPhone: '3331234567',
    studentEmail: 'invalid-student-email',
    parentName: 'Genitore',
    parentPhone: '3339876543',
    parentEmail: 'invalid-parent-email',
    parentRelation: 'padre',
  },
  medicalInfo: { medicalClearance: false },
  isActive: true,
};

// 1. Invalid student email fails
const schema = getProposedStudentFormSchema(false);
const res1 = schema.safeParse(baseData);
console.log('1. Invalid emails rejected:', !res1.success);
console.log('   Issues:', res1.error?.issues.map(i => `${i.path.join('.')}: ${i.message}`));

// 2. Empty student email allowed
const res2 = schema.safeParse({
  ...baseData,
  contact: {
    ...baseData.contact,
    studentEmail: '',
    parentEmail: 'parent@valid.com',
  },
});
console.log('2. Empty student email allowed:', res2.success);

// 3. Valid student and parent emails allowed
const res3 = schema.safeParse({
  ...baseData,
  contact: {
    ...baseData.contact,
    studentEmail: 'student@valid.com',
    parentEmail: 'parent@valid.com',
  },
});
console.log('3. Valid student and parent emails allowed:', res3.success);

// 4. In editing mode, empty parent email allowed
const schemaEdit = getProposedStudentFormSchema(true);
const res4 = schemaEdit.safeParse({
  ...baseData,
  contact: {
    studentPhone: '3331112233',
    studentEmail: 'student@valid.com',
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    parentRelation: '',
  },
});
console.log('4. Editing minor with empty parent fields allowed:', res4.success);
