# bookly

A web app for authors to map the storylines of a book on a story timeline. Main strands, side strands, sections, characters and typed connections live on one map; contradictions (for example a time jump that does not move forward) are surfaced as hints that never block saving. Characters have profiles (description, behavior, intentions) with optional per-storyline additions; with AI configured (see below) every text field gets an AI magic wand (rephrase, continue, polish style or suggest text from the context, with three suggestions to choose from), and the app warns about contradictions between a character's profile and a storyline. Warnings never block saving and can be acknowledged.

The UI is German; code and docs are English.

## Prerequisites

- Node.js >= 22 and npm
- PostgreSQL 16+ reachable on `localhost:5432` (OS-user auth works), or Docker for the bundled `docker-compose.yml`

## Setup

```sh
# Option A: local PostgreSQL
createdb bookly_dev
createdb bookly_test
createdb bookly_e2e   # only needed for npm run e2e

# Option B: Docker (creates bookly_dev, bookly_test and bookly_e2e; postgres/postgres).
# Point the tests at it: DATABASE_URL / TEST_DATABASE_URL / E2E_DATABASE_URL, e.g.
#   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/bookly_e2e npm run e2e
docker compose up -d

npm install
npx playwright install chromium   # only needed for npm run e2e
```

Migrations are applied automatically when the server starts.

Optionally copy your settings into a `.env` file in the repo root (loaded by the server, git-ignored). With the Docker setup use `DATABASE_URL=postgres://postgres:postgres@localhost:5432/bookly_dev`.

## Run

```sh
npm run dev
```

Starts the API (http://localhost:3000) and the web app (http://localhost:5173, proxies `/api` to the API).

## Tests

```sh
npm test            # unit and integration tests of all packages (needs bookly_test)
npm run typecheck   # TypeScript check of all packages
npm run e2e         # Playwright end-to-end flow (needs bookly_e2e, starts its own servers)
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://localhost:5432/bookly_dev` | Database of the API server |
| `TEST_DATABASE_URL` | `postgres://localhost:5432/bookly_test` | Database used by the server tests |
| `PORT` | `3000` | API server port |
| `OPENROUTER_API_KEY` | _(unset, AI off)_ | OpenRouter API key enabling the AI magic wand and AI character warnings |
| `OPENROUTER_MODEL` | _(none)_ | OpenRouter model id; required when `OPENROUTER_API_KEY` is set |
| `AI_FAKE` | _(unset)_ | Set to `1` to use a deterministic fake AI client (used by e2e) |
| `API_TARGET` | `http://localhost:3000` | API URL the web dev server proxies `/api` to |
| `E2E_DATABASE_URL` | `postgres://localhost:5432/bookly_e2e` | Database used by the e2e run |
| `E2E_API_PORT` | `3100` | API server port of the e2e run |
| `E2E_WEB_PORT` | `5174` | Web dev server port of the e2e run |

## Features

- Accounts with register, login and logout; every book belongs to one user.
- Books with ordered time points (rename, insert, reorder, delete with usage check).
- Storylines as main strands (with sections) or side strands, with status, colour, characters and notes.
- Interactive map: zoom, filters, notes overlay, drag to create ranges and connections.
- Typed connections (time jump, flashback, merge, character switch) with live contradiction hints, which can be acknowledged with „Bewusst so“.
- Scenes (places) with an optional image (JPEG/PNG/WebP, up to 5 MB, stored in the database) and any number of notes, assigned to sections with a per-section scene description; with AI configured the description can be generated from the scene's image and notes.
- Scene writing: every scene assignment is written in ordered blocks (split at the caret, insert, undo the split); the AI magic wand works per block with a length choice, and the book word range („Umfang“ on the manuscript page) guides draft length.
- Manuscript: AI chapter structure from storylines, characters and scenes (accept or reject), chapters and Bausteine that can be edited, moved and soft-deleted (trash with restore), every version kept, locks with a 30-minute timeout (per Baustein or whole chapter), instructions per Baustein for the AI draft, a reading preview, and up to 5 reviewers per book with individual rights who can comment and send suggestions for the author to accept.
- No upper limit on storylines, sections, time points, characters, scenes or notes.

## Layout

- `packages/shared` – domain types, validation and hint rules
- `packages/server` – Fastify API with Drizzle/PostgreSQL
- `packages/web` – React + Vite front end
- `e2e` – Playwright tests
