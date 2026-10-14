import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

export const onSchoolCreated = onDocumentCreated('schools/{schoolId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log('[onSchoolCreated] No data snapshot found.');
    return;
  }

  const school = snapshot.data();
  const schoolName = school.name || 'Nuova Scuola';
  const adminEmail = school.contact?.email;
  const qrToken = school.settings?.registrationQR?.token || 'N/D';

  if (!adminEmail) {
    console.warn(`[onSchoolCreated] No admin contact email found for school ${event.params.schoolId}. Skipping welcome email.`);
    return;
  }

  console.log(`[onSchoolCreated] Sending welcome email for school "${schoolName}" to ${adminEmail}`);

  const accessLink = `https://www.tropicalstyle.it/login`;
  const qrRegistrationLink = `https://www.tropicalstyle.it/join/${qrToken}`;

  const emailSubject = `Benvenuto su DanceFlow — La tua scuola "${schoolName}" è attiva!`;
  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #7C3AED; border-bottom: 2px solid #EDE9FE; padding-bottom: 10px;">Benvenuto in DanceFlow!</h2>
      <p>Gentile Amministratore,</p>
      <p>Siamo felici di comunicarti che l'attivazione della tua scuola di danza <strong>${schoolName}</strong> è avvenuta con successo.</p>
      
      <h3 style="color: #4C1D95; margin-top: 25px;">I tuoi primi passi su DanceFlow:</h3>
      <ol style="line-height: 1.6;">
        <li>
          <strong>Accedi alla Console:</strong><br />
          Usa le tue credenziali registrate per accedere al pannello di controllo al seguente link:<br />
          <a href="${accessLink}" style="color: #7C3AED; font-weight: bold; text-decoration: none;">Accedi alla Console DanceFlow</a>
        </li>
        <li style="margin-top: 10px;">
          <strong>Configura i Corsi:</strong><br />
          Entra nella sezione "Corsi" per inserire le discipline, gli orari delle lezioni e le tariffe mensili/annuali.
        </li>
        <li style="margin-top: 10px;">
          <strong>Attiva l'Auto-iscrizione degli Allievi:</strong><br />
          Puoi far registrare allievi e genitori in totale autonomia condividendo questo link di iscrizione pubblica o mostrando il relativo QR Code in segreteria:<br />
          <a href="${qrRegistrationLink}" style="color: #7C3AED; font-weight: bold; text-decoration: none;">Link per Auto-iscrizione Allievi</a><br />
          <span style="font-size: 11px; color: #666;">Il tuo token di sicurezza QR è: <code>${qrToken}</code></span>
        </li>
        <li style="margin-top: 10px;">
          <strong>Approva le Richieste:</strong><br />
          Quando un genitore compila il modulo online (inclusa la firma elettronica semplice FES), riceverai una notifica. Vai in <em>Impostazioni > Richieste</em> per verificare e approvare l'allievo con un solo click.
        </li>
      </ol>

      <div style="background-color: #F5F3FF; border-left: 4px solid #7C3AED; padding: 15px; margin-top: 30px; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; color: #5B21b6;">
          <strong>Supporto & Assistenza:</strong> Se hai dubbi durante la prima configurazione, consulta la documentazione o rispondi direttamente a questa email per contattare il nostro team di supporto.
        </p>
      </div>

      <p style="margin-top: 30px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #EEE; padding-top: 15px;">
        DanceFlow SaaS · La piattaforma gestionale automatizzata per scuole di danza
      </p>
    </div>
  `;

  try {
    // Scrive nella collezione globale "mail" per essere elaborata dall'estensione Trigger Email
    await admin.firestore().collection('mail').add({
      to: adminEmail,
      message: {
        subject: emailSubject,
        html: emailHtml,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[onSchoolCreated] Welcome email queued successfully in 'mail' collection.`);
  } catch (err) {
    console.error('[onSchoolCreated] Error queueing welcome email in Firestore:', err);
  }
});
