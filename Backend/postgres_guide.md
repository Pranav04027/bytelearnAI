# PostgreSQL and Prisma ownership

Use [Backend setup](README.md#development-setup) for the canonical configuration
and commands. This note distinguishes the two database owners; it is not a
production deployment runbook.

| Data | Configuration | Owner | Setup |
| --- | --- | --- | --- |
| Users, videos, quizzes, progress, transcript chunks/pgvector | `DATABASE_URL` | Prisma client with `PrismaPg` and product pg pool in `src/db/index.js` | `prisma/schema.prisma`; development `npm run db:generate` / `npm run db:push` |
| LangGraph workflow snapshots | Required `LANGGRAPH_DATABASE_URL` | Official PostgresSaver and dedicated pool in `src/graphs/postgresCheckpointer.js` | `npm run langgraph:setup`, fixed `bytelearn_langgraph` schema |

Run commands from `Backend/`. Schema setup writes to the configured database;
inspect configuration and use an explicitly safe development target. The product
schema declares `vector` and `uuid-ossp` (in `extensions`); appropriate extension
availability, schema and role permissions are prerequisites. Product and checkpoint
schemas can share one database but never share pool ownership.

The repository has no checked-in Prisma migration directory. `db:push` is the
provided development schema synchronization path; do not describe `migrate deploy`
as a complete setup path. Do not use `migrate dev`, reset, force or data-loss flags
as production deployment instructions. Prisma Studio (`npm run db:studio`) is an
editing tool, not a read-only verification step.

Checkpoint connections must be direct/session-mode; do not copy a transaction
pooler URL from the product configuration. Runtime verifies existing saver tables
before listening and does not run migrations or fall back to memory.

Four completed human/AI pairs bound latest active messages, not database retention.
Old snapshots, transcript evidence, drafts and task metadata can remain. Restrict
checkpoint schema/backups access and keep it out of exposed Data API schemas.
Backend persistence does not restore old frontend bubbles or resume HTTP streams.

Historical [Stage 5](docs/stage-5-implementation-evidence.md) and
[Stage 6](docs/stage-6-implementation-evidence.md) report disposable local PostgreSQL
continuity checks. [Stage 9](docs/stage-9-acceptance.md) did not run real PostgreSQL
or complete backend-process restart acceptance. See [safe PostgreSQL verification](README.md#safe-postgresql-verification)
for the explicit opt-in procedure; those checks were not rerun for Stage 10.
