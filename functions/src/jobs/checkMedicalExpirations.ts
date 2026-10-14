import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

/**
 * Helper to send a message via WhatsApp Business API / Twilio
 */
async function sendWhatsAppMessage(toPhone: string, text: string): Promise<boolean> {
  console.log(`[WhatsApp Hub] Preparing message to ${toPhone}: "${text}"`);
  
  // Twilio / WhatsApp Business API credentials placeholder
  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC_MOCK_ACCOUNT_SID';
  const authToken = process.env.TWILIO_AUTH_TOKEN || 'MOCK_AUTH_TOKEN';
  const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  
  if (accountSid === 'AC_MOCK_ACCOUNT_SID' || authToken === 'MOCK_AUTH_TOKEN') {
    console.log(`[WhatsApp Hub] Mocking WhatsApp send to ${toPhone} (Credentials not configured).`);
    return true;
  }
  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  
  try {
    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+39${toPhone}`;
    
    const params = new URLSearchParams();
    params.append('From', fromWhatsAppNumber);
    params.append('To', `whatsapp:${formattedPhone}`);
    params.append('Body', text);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WhatsApp Hub] Twilio API error: ${response.status} - ${errorText}`);
      return false;
    }
    
    const data: any = await response.json();
    console.log(`[WhatsApp Hub] Message sent successfully. Twilio SID: ${data.sid}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp Hub] Failed to send WhatsApp message via Twilio API:', err);
    return false;
  }
}

export const checkMedicalExpirations = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'Europe/Rome',
    memory: '256MiB',
  },
  async (event) => {
    const db = admin.firestore();
    const today = new Date();
    const todayTimestamp = admin.firestore.Timestamp.fromDate(today);

    console.log(`[checkMedicalExpirations] Starting job for date: ${today.toISOString()}`);

    try {
      // ─── 1. EXPIRED CERTIFICATES (Clearance is true but expiry <= today) ───
      const expiredStudentsSnap = await db
        .collectionGroup('students')
        .where('isDeleted', '==', false)
        .where('isActive', '==', true)
        .where('medicalInfo.medicalClearance', '==', true)
        .where('medicalInfo.medicalClearanceExpiry', '<=', todayTimestamp)
        .get();

      console.log(`[checkMedicalExpirations] Found ${expiredStudentsSnap.size} expired medical certificates.`);

      let batch = db.batch();
      let count = 0;
      const BATCH_LIMIT = 400;

      const schoolAdminsCache: Record<string, string[]> = {};
      const schoolNamesCache: Record<string, string> = {};

      for (const doc of expiredStudentsSnap.docs) {
        const student = doc.data();
        const studentId = doc.id;
        const schoolId = doc.ref.parent.parent?.id;

        if (!schoolId) {
          console.warn(`[checkMedicalExpirations] Student ${studentId} does not have a parent school.`);
          continue;
        }

        // Update student clearance to false
        batch.update(doc.ref, {
          'medicalInfo.medicalClearance': false,
          'updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;

        // Send parent in-app notification
        const parentId = student.parentId || studentId;
        const parentNotificationRef = db.collection(`users/${parentId}/notifications`).doc();
        
        const expiryDate = student.medicalInfo?.medicalClearanceExpiry?.toDate();
        const formattedExpiryDate = expiryDate 
          ? `${String(expiryDate.getDate()).padStart(2, '0')}/${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${expiryDate.getFullYear()}`
          : 'ieri';

        batch.set(parentNotificationRef, {
          id: parentNotificationRef.id,
          userId: parentId,
          schoolId: schoolId,
          title: '⚠️ Certificato Medico Scaduto!',
          body: `Gentile allievo/genitore, ti comunichiamo che il certificato medico per l'allievo "${student.firstName} ${student.lastName}" è scaduto il ${formattedExpiryDate}. Ti preghiamo di caricarne uno nuovo al più presto per riabilitare l'accesso alle lezioni.`,
          type: 'system',
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;

        // Send admin notifications
        if (!schoolAdminsCache[schoolId]) {
          try {
            const adminsSnap = await db
              .collection('users')
              .where('schoolId', '==', schoolId)
              .where('role', 'in', ['admin', 'owner', 'superadmin'])
              .get();
            schoolAdminsCache[schoolId] = adminsSnap.docs.map((a) => a.id);
          } catch (adminErr) {
            console.error(`[checkMedicalExpirations] Failed to fetch admins for school ${schoolId}:`, adminErr);
            schoolAdminsCache[schoolId] = [];
          }
        }

        const admins = schoolAdminsCache[schoolId];
        for (const adminUid of admins) {
          const adminNotificationRef = db.collection(`users/${adminUid}/notifications`).doc();
          batch.set(adminNotificationRef, {
            id: adminNotificationRef.id,
            userId: adminUid,
            schoolId: schoolId,
            title: '⚠️ Scadenza Certificato Medico',
            body: `Il certificato medico dell'allievo "${student.firstName} ${student.lastName}" è scaduto. Il suo stato è stato impostato a non valido.`,
            type: 'system',
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          count++;

          if (count >= BATCH_LIMIT) {
            await batch.commit();
            console.log(`[checkMedicalExpirations] Committed batch of ${count} operations (expired loop).`);
            batch = db.batch();
            count = 0;
          }
        }

        if (count >= BATCH_LIMIT) {
          await batch.commit();
          console.log(`[checkMedicalExpirations] Committed batch of ${count} operations (expired loop).`);
          batch = db.batch();
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
        console.log(`[checkMedicalExpirations] Committed final batch of ${count} operations (expired).`);
        batch = db.batch();
        count = 0;
      }


      // ─── 2. EXPIRING CERTIFICATES (Clearance is true, expires in exactly 30 days) ───
      const targetDateStart = new Date(today);
      targetDateStart.setDate(today.getDate() + 30);
      targetDateStart.setHours(0, 0, 0, 0);

      const targetDateEnd = new Date(today);
      targetDateEnd.setDate(today.getDate() + 30);
      targetDateEnd.setHours(23, 59, 59, 999);

      const targetStartTimestamp = admin.firestore.Timestamp.fromDate(targetDateStart);
      const targetEndTimestamp = admin.firestore.Timestamp.fromDate(targetDateEnd);

      const expiringStudentsSnap = await db
        .collectionGroup('students')
        .where('isDeleted', '==', false)
        .where('isActive', '==', true)
        .where('medicalInfo.medicalClearance', '==', true)
        .where('medicalInfo.medicalClearanceExpiry', '>=', targetStartTimestamp)
        .where('medicalInfo.medicalClearanceExpiry', '<=', targetEndTimestamp)
        .get();

      console.log(`[checkMedicalExpirations] Found ${expiringStudentsSnap.size} students with medical certificates expiring in exactly 30 days.`);

      for (const doc of expiringStudentsSnap.docs) {
        const student = doc.data();
        const studentId = doc.id;
        const schoolId = doc.ref.parent.parent?.id;

        if (!schoolId) {
          console.warn(`[checkMedicalExpirations] Student ${studentId} does not have a parent school.`);
          continue;
        }

        // Fetch school name
        if (!schoolNamesCache[schoolId]) {
          try {
            const schoolSnap = await db.collection('schools').doc(schoolId).get();
            schoolNamesCache[schoolId] = schoolSnap.exists ? (schoolSnap.data()?.name || 'DanceFlow') : 'DanceFlow';
          } catch (schoolErr) {
            console.error(`[checkMedicalExpirations] Failed to fetch school name for ${schoolId}:`, schoolErr);
            schoolNamesCache[schoolId] = 'DanceFlow';
          }
        }
        const schoolName = schoolNamesCache[schoolId];

        const expiryDate = student.medicalInfo.medicalClearanceExpiry.toDate();
        const formattedExpiryDate = `${String(expiryDate.getDate()).padStart(2, '0')}/${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${expiryDate.getFullYear()}`;

        const parentName = student.contact?.parentName || 'Genitore';
        const studentName = `${student.firstName} ${student.lastName}`;

        // A. Queue standard email message in schools/{schoolId}/messages
        const msgRef = db.collection(`schools/${schoolId}/messages`).doc();
        batch.set(msgRef, {
          id: msgRef.id,
          schoolId,
          subject: `Scadenza Certificato Medico in 30 Giorni - ${studentName}`,
          body: `Ciao ${parentName},\n\nti ricordiamo che il certificato medico di ${studentName} iscritto a ${schoolName} scadrà il ${formattedExpiryDate}.\n\nPer motivi legali e assicurativi, ti invitiamo a caricare il nuovo certificato prima di tale data accedendo direttamente al tuo Portale Allievi.\n\nGrazie!`,
          authorId: 'system',
          recipientType: 'students',
          recipientIds: [studentId],
          channels: ['email'],
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;

        // B. Add in-app notification in users/{parentId}/notifications
        const parentId = student.parentId || studentId;
        const parentNotificationRef = db.collection(`users/${parentId}/notifications`).doc();
        batch.set(parentNotificationRef, {
          id: parentNotificationRef.id,
          userId: parentId,
          schoolId,
          title: '⚠️ Scadenza Certificato Medico',
          body: `Gentile allievo/genitore, ti ricordiamo che il certificato medico di ${studentName} scadrà il ${formattedExpiryDate}. Ti invitiamo a caricare il nuovo certificato sul tuo Portale Allievi.`,
          type: 'system',
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;

        // C. Send WhatsApp message via Twilio helper
        const parentPhone = student.contact?.parentPhone || student.contact?.studentPhone;
        if (parentPhone) {
          const whatsappText = `Ciao ${parentName}, ti ricordiamo che il certificato medico di ${studentName} iscritto a ${schoolName} scadrà il ${formattedExpiryDate}. Per motivi legali e assicurativi, ti invitiamo a caricare il nuovo certificato prima di tale data accedendo direttamente al tuo Portale Allievi. Grazie!`;
          await sendWhatsAppMessage(parentPhone, whatsappText);
        } else {
          console.warn(`[checkMedicalExpirations] Student ${studentId} does not have parent or student phone for WhatsApp reminder.`);
        }

        if (count >= BATCH_LIMIT) {
          await batch.commit();
          console.log(`[checkMedicalExpirations] Committed batch of ${count} operations (expiring loop).`);
          batch = db.batch();
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
        console.log(`[checkMedicalExpirations] Committed final batch of ${count} operations (expiring).`);
      }

      console.log('[checkMedicalExpirations] Completed medical expiration checks successfully.');
    } catch (err) {
      console.error('[checkMedicalExpirations] Error running job:', err);
      throw err;
    }
  }
);
