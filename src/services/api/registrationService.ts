import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { nowTimestamp } from '../../lib/converters';

export interface RegistrationPayload {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentRelation: string;
  parentUid: string;
  studentFirstName: string;
  studentLastName: string;
  studentBirthDate: string;
  studentGender: string;
  studentFiscalCode: string;
  studentPhone?: string;
  studentEmail?: string;
  addressStreet: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  courseInterest: string;
  pdfUrl: string;
  sha256Hash: string;
  signatureMetadata: {
    ipAddress: string;
    timestamp: number;
    userAgent: string;
    sessionId: string;
    consents: {
      privacyCommon: boolean;
      privacySanitary: boolean;
    };
  };
}

export const submitRegistrationRequest = async (
  schoolId: string,
  data: RegistrationPayload
): Promise<void> => {
  const requestRef = doc(collection(db, `schools/${schoolId}/registrationRequests`));
  
  await setDoc(requestRef, {
    id: requestRef.id,
    parentName: data.parentName.trim(),
    parentEmail: data.parentEmail.trim(),
    parentPhone: data.parentPhone.trim(),
    parentRelation: data.parentRelation,
    parentUid: data.parentUid,
    studentFirstName: data.studentFirstName.trim(),
    studentLastName: data.studentLastName.trim(),
    studentName: `${data.studentFirstName.trim()} ${data.studentLastName.trim()}`,
    studentBirthDate: Timestamp.fromDate(new Date(data.studentBirthDate)),
    gender: data.studentGender,
    fiscalCode: data.studentFiscalCode.trim().toUpperCase(),
    address: {
      street: data.addressStreet.trim(),
      city: data.addressCity.trim(),
      province: data.addressProvince.trim().toUpperCase(),
      postalCode: data.addressPostalCode.trim(),
      country: 'Italia',
    },
    studentPhone: data.studentPhone?.trim() || null,
    studentEmail: data.studentEmail?.trim() || null,
    courseInterest: data.courseInterest,
    pdfUrl: data.pdfUrl,
    sha256Hash: data.sha256Hash,
    signatureMetadata: {
      ipAddress: data.signatureMetadata.ipAddress,
      timestamp: Timestamp.fromMillis(data.signatureMetadata.timestamp),
      userAgent: data.signatureMetadata.userAgent,
      sessionId: data.signatureMetadata.sessionId,
      consents: {
        privacyCommon: data.signatureMetadata.consents.privacyCommon,
        privacySanitary: data.signatureMetadata.consents.privacySanitary,
      },
    },
    status: 'pending',
    createdAt: nowTimestamp(),
  });
};
