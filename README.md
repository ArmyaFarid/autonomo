# Autónomo — Facturation pour travailleur autonome (Québec)

Application de bureau locale pour gérer la facturation d'un travailleur autonome au
Québec : clients, factures conformes à Revenu Québec, paiements, dépenses
d'entreprise et préparation de la déclaration de revenus annuelle.

L'interface est en **français (fr-CA)** par défaut, avec l'anglais (en-CA) en option.
Toutes les données restent sur la machine de l'utilisateur — aucune synchronisation
cloud.

## Fonctionnalités

- **Clients** — CRUD complet, facturation horaire ou forfaitaire, archivage
- **Factures** — création conforme aux exigences de Revenu Québec, numérotation
  séquentielle, génération PDF (Puppeteer), pièces justificatives des heures
- **Cycle de vie** — statuts de document (brouillon / émise / annulée) et statut de
  paiement calculé (impayée / partielle / payée / créditée)
- **Paiements** — paiements complets ou partiels avec preuve jointe
- **Dépenses** — suivi par catégorie, taux de déductibilité, reçus
- **Rapports** — tableau de bord, revenus sur base d'encaissement, rapport fiscal
  annuel, exports PDF / CSV
- **Sauvegarde** — sauvegarde locale automatique en `.zip` et restauration

> **Conformité permis d'études** — les heures travaillées et la période de travail
> sont **obligatoires sur chaque facture** et ne peuvent jamais être masquées.

## Stack technique

| Domaine        | Technologie                          |
| -------------- | ------------------------------------ |
| Application    | Electron + Vite + React + TypeScript |
| UI             | shadcn/ui + Tailwind CSS             |
| État global    | Jotai                                |
| Base de données| Drizzle ORM + better-sqlite3         |
| PDF            | Puppeteer (HTML/CSS)                 |
| i18n           | i18next + react-i18next              |
| Sauvegarde     | adm-zip                              |

## Prérequis

- Node.js 20+
- npm

## Démarrage

```bash
npm install        # installe et recompile better-sqlite3 pour Electron
npm run dev         # lance l'application en mode développement
```

## Scripts

| Commande              | Description                              |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | Lance l'app en mode développement        |
| `npm run build`       | Build de production dans `out/`          |
| `npm run typecheck`   | Vérification TypeScript (`tsc --noEmit`) |
| `npm run build:mac`   | Génère l'installeur macOS                |
| `npm run build:win`   | Génère l'installeur Windows              |
| `npm run build:linux` | Génère l'installeur Linux                |

## Structure du projet

```
electron/        Processus principal Electron, preload et handlers IPC
db/              Schéma Drizzle et migrations SQLite
src/
  pages/         Pages par module (dashboard, clients, invoices, ...)
  components/    Composants UI (shadcn) et partagés
  store/         Atomes Jotai
  locales/       Fichiers de traduction fr / en
templates/       Gabarits HTML/CSS des factures
```

## Données utilisateur

Les données sont stockées dans `~/Documents/ArmyaFacturation/` (configurable) :
base SQLite, `config.json`, pièces jointes et sauvegardes.

## Développement assisté par IA

Une partie du code de ce projet a été produite avec l'assistance d'outils d'IA
générative, utilisés comme support de développement. L'IA n'est pas autonome :
elle travaille sous la direction, la supervision et la revue de l'auteur,
**Armya Bakouan**, développeur logiciel et React fort de 4 ans d'expérience.

L'architecture, les décisions techniques, les choix métier et la validation
finale du code relèvent entièrement de l'auteur. L'IA accélère la mise en œuvre ;
l'expertise humaine garde la responsabilité du résultat.

## Licence

GNU General Public License v3.0 ou ultérieure — voir le fichier [`LICENSE`](LICENSE).

Le code est libre et ouvert. Toute version modifiée et distribuée doit rester
sous licence GPL.
