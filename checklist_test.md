# Checklist Test Completa — DanceFlow PWA

Questa checklist serve per tracciare lo stato dei test delle varie funzionalità dell'app. Spunta con `[x]` i test superati con successo.

## 1. Autenticazione
- `[x]` Pagina login appare correttamente all'apertura del sito
- `[x]` Pulsante occhio password funziona
- `[x]` Login con credenziali errate → messaggio di errore visibile
- `[x]` Login con credenziali corrette → redirect corretto
- `[x]` Logout immediato senza caricamento infinito
- `[x]` Dopo logout → torna alla pagina login
- `[x]` Re-login funziona senza problemi

## 2. Registrazione nuova scuola
- `[x]` Click "Inizia prova gratuita" → apre form registrazione
- `[x]` Registrazione con nuova email → redirect a onboarding
- `[x]` Step 1 onboarding si salva correttamente
- `[x]` Step 2 onboarding si salva correttamente
- `[x]` Step 3 onboarding si salva correttamente
- `[x]` Click "Completa configurazione" → nessun errore permissions
- `[x]` Redirect alla dashboard dopo onboarding
- `[x]` Su Firebase Console → Firestore → collection schools → documento creato correttamente

## 3. Dashboard
- `[x]` Si carica senza React Error #185
- `[x]` KPI mostrano dati reali (anche se zero)
- `[x]` Nessun errore in console
- `[x]` Ricarica pagina (F5) → rimane loggato

## 4. Modulo Allievi
- `[x]` Lista allievi si apre senza errori
- `[x]` Click "Nuovo Allievo" → form si apre
- `[x]` Crea allievo con tutti i campi → si salva su Firestore
- `[x]` Allievo appare nella lista
- `[x]` Click su allievo → scheda dettaglio si apre
- `[x]` Tab Anagrafica, Corsi, Pagamenti, Presenze, Documenti funzionano
- `[x]` Modifica allievo → salvataggio corretto
- `[x]` Pulsante "Sollecita" documenti funziona

## 5. Modulo Corsi
- `[x]` Lista corsi si apre senza errori
- `[x]` Crea nuovo corso → si salva (es. durante onboarding/dashboard)
- `[x]` Card corso appare con colore corretto
- `[x]` Dettaglio corso → tab Info, Allievi, Orari funzionano
- `[x]` Iscrivi allievo al corso → appare nella lista

## 6. Modulo Pagamenti
- `[x]` Lista pagamenti si apre senza errori
- `[x]` Genera quote mensili funziona
- `[x]` Segna pagamento come pagato → status cambia
- `[x]` Toggle ricevuta PDF → genera PDF scaricabile
- `[x]` Dashboard morosità mostra dati corretti

## 7. Modulo Presenze
- `[x]` Pagina presenze si apre senza errori
- `[x]` Seleziona corso e data → lista allievi appare
- `[x]` Tap presente/assente/giustificato → si salva in tempo reale
- `[x]` Statistiche presenze aggiornate

## 8. Calendario
- `[x]` Si apre senza errori
- `[x]` Mostra corsi configurati
- `[x]` Click su sessione → dettaglio si apre

## 9. Comunicazioni
- `[x]` Si apre senza errori
- `[x]` Crea nuovo annuncio → si salva
- `[x]` Storico messaggi visibile

## 10. Eventi
- `[x]` Si apre senza errori
- `[x]` Crea nuovo evento → si salva (data + orario opzionale)
- `[x]` Dettaglio evento → si apre senza errori di caricamento
- `[x]` Aggiungi partecipanti funziona

## 11. Impostazioni
- `[x]` Si apre senza errori
- `[x]` QR code scuola visibile e scaricabile
- `[x]` Modifica dati scuola → si salva

## 12. Portale Genitori
- `[x]` Registrazione via QR link funziona
- `[x]` Login genitore → vede solo i dati del proprio figlio
- `[x]` Presenze visibili
- `[x]` Stato pagamenti visibile
- `[x]` Messaggi scuola visibili

## 13. PWA
- `[x]` Chrome → 3 puntini → "Installa app" disponibile
- `[x]` App installata si expo come standalone
- `[x]` Funziona offline (pagine già visitate)
