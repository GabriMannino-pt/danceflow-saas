# 💃 DanceFlow — Multi-Tenant Dance Academy Management & Payment Automation Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React Version](https://img.shields.io/badge/React-19.0.0-61dafb.svg?logo=react)]()
[![TypeScript Version](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg?logo=typescript)]()
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.0-38bdf8.svg?logo=tailwindcss)]()
[![Stripe API](https://img.shields.io/badge/Stripe-Payments_&_Webhooks-635bff.svg?logo=stripe)]()
[![Supabase](https://img.shields.io/badge/Supabase-Storage_&_Signed_URLs-3ecf8e.svg?logo=supabase)]()

> **Commissioned by:** Tropical Style Dance Academy (Catania, Italy)  
> **Author & Lead Architect:** [Gabriele Mannino](https://github.com/GabriMannino-pt)  
> **Live Showcase / Repository:** [GabriMannino-pt/danceflow-saas](https://github.com/GabriMannino-pt/danceflow-saas)

---

## 🇮🇹 Sintesi del Progetto (Italian Abstract)

**DanceFlow** è una piattaforma gestionale autonoma e reattiva, progettata e sviluppata su misura per digitalizzare e automatizzare a 360° l'intera gestione operativa, didattica e finanziaria della scuola di ballo **Tropical Style Dance Academy**.

A partire dalle criticità della gestione cartacea tradizionale, la piattaforma ha introdotto:
- **Autoregistrazione allievi con firma digitale (FES)** touch-first su smartphone tramite QR Code dedicato.
- **Integrazione completa con Stripe API** per pagamenti digitali, quote associative mensili e ricevute istantanee.
- **Automazione contabile & solleciti**: scansione automatica delle scadenze e invio notifiche transazionali (WhatsApp & Email).
- **Controllo certificati medici**: alert automatici a scadenza e blocco preventivo degli accessi in caso di mancato rinnovo.
- **Risultato commerciale**: **-70% di tempo manuale** dedicato alla segreteria e azzeramento dei ritardi nelle quote.

---

## 🇬🇧 Executive Overview & System Architecture

DanceFlow is a production-grade, multi-tenant administrative engine built with modern React 19, TypeScript, and a serverless backend. Designed with an ultra-responsive dark mode UI and glassmorphism styling, it optimizes complex workflows across students, teachers, parents, and administrative staff.

```
                    ┌──────────────────────────────────────────────┐
                    │       DanceFlow Client (React 19 + TS)       │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
             ┌──────────────▼─────────────┐ ┌──────────────▼─────────────┐
             │   Self-Service QR Portal   │ │   Admin & Staff Dashboard   │
             │ (Touch FES Digital Sign)   │ │  (Real-Time Analytics & CRM)│
             └──────────────┬─────────────┘ └──────────────┬─────────────┘
                            │                              │
     ┌──────────────────────┼──────────────────────────────┼──────────────────────┐
     │                      │                              │                      │
┌────▼─────────────┐ ┌──────▼─────────────┐ ┌──────────────▼──────┐ ┌─────────────▼────────────┐
│  Stripe Gateway  │ │  Supabase Storage  │ │ Firebase Serverless  │ │ Messaging Daemon        │
│ (Webhooks & Subs)│ │ (Encrypted PDFs)   │ │ (Rules & Multi-Tenant│ │ (WhatsApp & Email Alerts│
└──────────────────┘ └────────────────────┘ └──────────────────────┘ └──────────────────────────┘
```

---

## 🌟 Key Engineering Features

### 1. Touch-First Self-Service Registration & FES Signature
- **Dynamic QR Onboarding:** Instant generation of school-specific QR codes allowing parents/students to register directly from their mobile devices.
- **Client-Side FES Signature:** Native HTML5 canvas signature capturing biometric metadata (timestamp, user-agent, client IP, document SHA-256 hash).
- **Automated PDF Generation:** Instant generation of binding registration contracts stored in private encrypted buckets with secure time-limited signed URLs.

### 2. Stripe Payments & Financial Reconciliations
- **Billing Lifecycle Automation:** Native Stripe SDK integration supporting one-time payments and recurring subscriptions for course fees.
- **Webhook Resilience:** Robust webhook consumers handling asynchronous payment events, invoice generation, and status updates with idempotency keys.
- **Overdue Daemon:** Automated cron-like evaluation detecting overdue accounts and triggering grace-period notifications.

### 3. Student Lifecycle & Health Compliance
- **Medical Certificate Engine:** Real-time tracking of medical certification validity (`Valid`, `Expiring in 30 Days`, `Expired`, `Missing`).
- **Safety Gate:** Dynamic gating disabling class attendance and event participation when health certificates expire.
- **Offline-First Attendance:** Local caching strategy ensuring staff can log class attendances during network disruptions.

---

## 💻 Tech Stack & Standards

| Domain | Technology / Tool | Rationale |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, Vite, Tailwind CSS v4 | High frame-rate transitions, zero-runtime CSS, modern concurrent features |
| **Language** | TypeScript (Strict Mode) | Full type safety across payloads, data models, and API responses |
| **State Management**| Zustand | Lightweight, unopinionated centralized state without Redux overhead |
| **Payments** | Stripe API, Webhooks | PCI-compliant financial operations, subscription management |
| **File Storage** | Supabase Storage | Encrypted storage for legal PDF agreements and signed documents |
| **Database & Auth** | Firebase Firestore & Cloud Auth | Sub-second real-time sync, granular security rules for multi-tenancy |
| **Document Engine** | jsPDF, ExcelJS | Client-side contract rendering and structured data exports |

---

## 📁 Repository Structure

```bash
danceflow/
├── public/                 # Static branding and vector assets
├── screenshots/            # Automated test and deployment previews
│   ├── collaudo_admin/     # Admin dashboard screenshots
│   └── visual_audit/       # UI/UX audit captures
├── src/
│   ├── components/         # Reusable atomic UI elements (Modals, Buttons, Forms)
│   ├── contexts/           # Authentication & Tenant Context Providers
│   ├── hooks/              # Custom React hooks (useAttendance, useStripeBilling)
│   ├── services/           # Decoupled API layers (Stripe, Firebase, Supabase)
│   ├── types/              # Domain-specific TypeScript models and interfaces
│   ├── utils/              # PDF generators, validators, forensic hashing
│   └── views/              # Core screens (Dashboard, Students, Courses, Payments)
├── firestore.rules         # Enterprise multi-tenant isolation rules
└── vite.config.ts          # Build pipeline and chunking optimization
```

---

## 🚀 Local Development Setup

### 1. Clone the repository
```bash
git clone https://github.com/GabriMannino-pt/danceflow-saas.git
cd danceflow-saas
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env.local` file in the root directory:
```env
VITE_FIREBASE_API_KEY=your_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_STRIPE_PUBLIC_KEY=pk_test_your_stripe_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run development server
```bash
npm run dev
```

---

## 👤 Author & Architecture Inquiries

Developed and maintained by **Gabriele Mannino**  
- **LinkedIn:** [linkedin.com/in/gabriele-mannino-dev](https://www.linkedin.com/in/gabriele-mannino-dev)  
- **GitHub:** [github.com/GabriMannino-pt](https://github.com/GabriMannino-pt)  
- **Portfolio:** [gabri-mannino-dev.web.app](https://gabri-mannino-dev.web.app/)
