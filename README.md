# Schulplattform (Arbeitstitel)

Moderne Schulplattform für Österreich. Spezifikation: [docs/spec.md](docs/spec.md), Entscheidungen: [docs/adr/](docs/adr/).

## Schnellstart

```bash
cp .env.example .env
docker compose up -d       # Postgres, Mailpit (http://localhost:8025), S3-kompatibler Speicher
pnpm install
pnpm db:generate
pnpm db:migrate            # Migrationen anwenden
pnpm db:seed               # Demoschule (Konten: Passwort siehe packages/db/prisma/seed.ts)
pnpm dev                   # Web http://localhost:3000, API http://localhost:4000
```

Prüfen: `pnpm lint && pnpm typecheck && pnpm test`.
