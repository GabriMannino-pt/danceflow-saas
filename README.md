# 💃 DanceFlow — SaaS Multi-Tenant per la Gestione di Scuole di Danza

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![React Version](https://img.shields.io/badge/React-19.0.0-blue.svg)]()
[![TypeScript Version](https://img.shields.io/badge/TypeScript-6.0.0-blue.svg)]()
[![Firebase](https://img.shields.io/badge/Firebase-v12-orange.svg)]()
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.0-38bdf8.svg)]()

**DanceFlow** è un'applicazione SaaS (Software-as-a-Service) multi-tenant premium, progettata specificamente per digitalizzare ed automatizzare a 360° la gestione amministrativa, contabile e logistica delle scuole di danza. 

Sviluppata con un design d'avanguardia in **Dark Mode**, offre un'esperienza d'uso premium basata su **Glassmorphism**, transizioni fluide ed un'architettura robusta e scalabile offline-first.

---

## 🚀 Funzionalità Principali

### 🏢 Architettura Multi-Tenant & SaaS Control
* **SuperAdmin Dashboard**: Cabina di regia globale del SaaS per monitorare tutti i tenant attivi, consultare le statistiche generali (allievi totali, scuole registrate) ed attivare/sospendere istantaneamente l'accesso alle scuole (SaaS Tenant Suspend).
* **Isolamento dei Dati (Multi-Tenancy)**: Regole di sicurezza Firestore (`firestore.rules`) rigide per l'isolamento completo e sicuro dei dati di ciascuna scuola.
* **Controllo dei Limiti del Piano**: Enforcing automatico client-side e database-side del numero massimo di allievi inseribili in base al livello di abbonamento attivo.

### 📱 Portale Genitori & Autoregistrazione (Firma FES)
* **Modulo di Iscrizione Self-Service via QR Code**: Generazione di un QR Code unico e link pubblico per consentire ai genitori di registrare autonomamente i propri figli.
* **Firma Elettronica Semplice (FES) Touch-First**: Canvas integrato per la firma digitale del modulo direttamente dallo smartphone.
* **Generatore PDF Client-Side & Storage Privato**: Generazione immediata del PDF d'iscrizione con metadati forensi (IP del client, timestamp, User-Agent, SHA-256 del documento) caricato automaticamente su un'area privata e sicura di **Supabase Storage** con signed URL temporanei a 10 anni.

### ⚡ Automazioni Contabili & Messaggistica WhatsApp
* **Emissione Batch Rette Mensili**: Daemon (cron simulato) per generare in un solo clic tutte le rette pendenti del mese per gli allievi attivi.
* **Gestione Solleciti & Overdue Daemon**: Scansione automatica delle scadenze contabili con aggiornamento dello stato in "Scaduto" (overdue) e invio di notifiche push in-app e notifiche WhatsApp.
* **WhatsApp Business API Simulator**: Test e anteprima in tempo reale sullo schermo di uno smartphone mockup dei messaggi transazionali inviati alle famiglie (emissione rette, solleciti, ricevute di pagamento).

### 🩺 Certificati Medici & Registro Presenze
* **Controllo Scadenze Automatico**: Calcolo in tempo reale della validità del certificato medico (Valido, In Scadenza -30 giorni, Scaduto o Mancante) con blocco automatico del Portale Genitori in caso di certificato non valido.
* **Notifiche In-App & Push**: Badge notifiche in tempo reale sulla sidebar con supporto alle letture batch.
* **Registro Presenze Offline-First**: Registrazione quotidiana delle presenze degli allievi funzionante anche in assenza di connessione internet tramite persistenza SQLite/IndexedDB locale.

---

## 🛠️ Stack Tecnologico

* **Frontend**: React 19 (TypeScript), Vite, Tailwind CSS v4, Zustand (gestione stato globale).
* **Backend**: Firebase Serverless (Firestore, Cloud Auth, Cloud Storage, Firebase Cloud Functions).
* **Storage Certificati & Moduli**: Supabase Private Buckets (con Signed URLs).
* **Sicurezza & Bot Protection**: Firebase App Check integrato con Google reCAPTCHA v3.
* **Fatturazione & Pagamenti**: Integrazione nativa con Stripe SDK.
* **PDF & Esportazioni**: jsPDF, ExcelJS, esportazioni strutturate per gare di danza (`danceflow-competition-v1`).
* **Monitoring**: Sentry Integration per tracciare crash del client e log degli errori.

---

## 📦 Setup in 5 Passi

Segui questa guida per avviare l'intero ecosistema DanceFlow in locale in meno di 5 minuti.

### 1. Clona il Repository
```bash
git clone https://github.com/tuo-username/danceflow.git
cd danceflow
```

### 2. Configura le Variabili d'Ambiente
Crea un file `.env.local` partendo dal modello fornito:
```bash
cp .env.example .env.local
```
Compila i campi inserendo le chiavi del tuo progetto Firebase e della tua istanza Supabase.

### 3. Installa le Dipendenze
Installa i pacchetti necessari per il client web e per le Cloud Functions:
```bash
# Dipendenze Frontend
npm install

# Dipendenze Cloud Functions
cd functions
npm install
cd ..
```

### 4. Avvia il Server di Sviluppo Locale
Avvia l'applicazione in modalità di sviluppo con Vite:
```bash
npm run dev
```
Il gestionale sarà accessibile su `http://localhost:5173`.

### 5. Compila ed Esegui il Deploy
Se hai installato la Firebase CLI, puoi pubblicare il frontend con un comando:
```bash
# Compilazione del bundle ottimizzato
npm run build

# Deploy su Firebase Hosting
firebase deploy --only hosting
```

---

## 📈 Tabella dei Piani e Pricing SaaS

L'applicazione supporta nativamente 4 piani tariffari attivabili con toggle di fatturazione Mensile / Annuale (sconto del 20%):

| Piano | Prezzo Mensile | Prezzo Annuale (Mese) | Limite Allievi | Funzionalità Incluse |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | €0 | €0 | **Max 20** | Funzioni core di gestione, no automazioni |
| **Light** | €19/mese | €15/mese | **Max 80** | Firma digitale FES + Portale Genitori |
| **Growth** | €49/mese | €39/mese | **Max 200** | + WhatsApp Business Hub + Automazioni Scadenze |
| **Unlimited** | €84/mese | €69/mese | **Illimitati** | + Supporto multi-sede + Assistente AI integrato |

---

## 🔗 Demo Online
Puoi testare le ultime funzionalità rilasciate in produzione direttamente sulla nostra istanza di staging:
👉 **[Accedi alla Demo di Staging](https://danceflow-saas.web.app)**

---

*DanceFlow è stato sviluppato per scopi di portfolio professionale e come dimostrazione di un SaaS multi-tenant completo in ambiente serverless.*
