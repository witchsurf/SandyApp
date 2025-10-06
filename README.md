# SandyApp

Assistant IA de planification de menus et de gestion d'inventaire, construit avec React + Vite côté front et un serveur Express connecté à Supabase.

## Prérequis

- Node.js 20.x (la CI tourne sur Node 20)
- npm 10 (utilisé par les commandes ci-dessous)
- Un projet Supabase avec les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
- Une clé OpenAI (optionnel mais nécessaire pour générer les menus IA)

## Installation

```bash
npm ci
cp .env.example .env # crée un .env si besoin
```

Remplis ensuite les variables dans `.env` :

```ini
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
NOTIFY_WEBHOOK=... # optionnel
ALERT_EMAIL=...    # optionnel
```

## Scripts npm

| Commande              | Description                                                 |
|-----------------------|-------------------------------------------------------------|
| `npm run dev`         | Lance Vite + nodemon (front + API en mode dev)              |
| `npm run build`       | Build front (Vite) dans `dist/`                             |
| `npm run lint`        | ESLint sur l'ensemble du repo                               |
| `npm test`            | Tests Node.js (inclut la suite de sanitation de recettes)   |
| `npm run test:recipes`| Tests ciblés des helpers de validation d'URLs de recette    |
| `npm run preview`     | Sert le build Vite en local                                 |
| `npm run typecheck`   | Vérifie les types TypeScript                                |

## Qualité & Sécurité

- CI GitHub Actions : `npm ci`, `npm run lint`, `npm test`, `npm run build`
- `npm audit fix` a résolu les vulnérabilités non-breaking. Une vulnérabilité **moderate** persiste sur `esbuild` (héritée via `vite`). Correction disponible uniquement en upgradant vers Vite ≥6 (breaking). À suivre lors d'une prochaine montée de version.
- Le module `server/recipeUtils.js` effectue une sanitation stricte des URLs de recettes avec whitelist de domaines, vérification de mots-clefs et mise en cache courte (1 h).

Pour exécuter un audit :

```bash
npm audit
```

## Déploiement

### Build front (Vite)

1. `npm run build`
2. Déployer le dossier `dist/` sur l’hébergeur de ton choix (Vercel, Netlify, S3 + CloudFront, etc.).

### API Express

Le serveur `server.js` lit les mêmes variables `.env`. Pour un déploiement (Render, Railway, Fly.io, etc.) :

1. `npm ci`
2. `npm run build` (pour le front) puis servir `dist/`
3. `node server.js`
4. Configure les variables d'environnement (Supabase, OpenAI, webhooks…)

### Supabase

Les migrations SQL se trouvent dans `supabase/migrations/`. Tu peux les appliquer via Supabase CLI :

```bash
supabase db push
```

## Développement

1. `npm run dev`
2. Interface disponible sur http://localhost:5173, serveur Express sur http://localhost:3000
3. `npm run lint` & `npm test` à lancer avant chaque PR

## CI/CD

Voir `.github/workflows/ci.yml` (Node 20). Le workflow :

1. Installe les dépendances (`npm ci`)
2. Lint (`npm run lint`)
3. Tests (`npm test`)
4. Build (`npm run build`)

Un badge peut être ajouté quand la CI est stable :

```markdown
![CI](https://github.com/witchsurf/SandyApp/actions/workflows/ci.yml/badge.svg)
```

## Roadmap

- Mettre à jour Vite et esbuild (après audit de compatibilité)
- Ajouter des tests E2E pour la génération IA
- Déployer automatiquement le front + API via Actions ou Vercel

---

💡 Besoin d'aide pour le déploiement ? Mets-moi en copie et on le configure ensemble.
