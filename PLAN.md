Step Id: 14

# Implementation Plan: Database Migration

## 1. Overview

The current application uses file-based JSON logging (`.jsonl`) for storing instance history and moderation logs. We will migrate this to a robust **SQLite** database using **Prisma** ORM. This ensures better performance, data integrity, and easier querying.

## 2. New Architecture

- **Database Engine**: SQLite
- **ORM**: Prisma (already installed)
- **Database Location**: Managed by `StorageService` (defaults to User Documents or Configured Path).

## 3. Schema Design

We will define the following models:

- **Session**: Represents a continuous visit to a VRChat instance.
- **LogEntry**: Represents individual events (joins, leaves, moderations) within a session.

## 4. Files to Modify/Create

### A. `prisma/schema.prisma` (New/Update)

Define the SQLite datasource and models.

### B. `electron/services/DatabaseService.ts` (New)

A singleton service responsible for:

- Initializing the Prisma Client with the dynamic database path from `StorageService`.
- Handling database connections.
- Exposing methods for creating sessions and logs.

### C. `electron/services/InstanceLoggerService.ts` (Refactor)

- **Remove**: All `fs` (file system) operations related to writing `.jsonl` files.
- **Inject**: `DatabaseService`.
- **Logic Change**:
  - `handleLocationChange`: Call `db.createSession()`.
  - `logEvent`: Call `db.createLogEntry()`.
  - `getSessions`: Query `db.sessions.findMany()`.

### D. `electron/services/StorageService.ts` (Update)

- Ensure it provides a stable path for the `database.sqlite` file.

## 5. Implementation Steps

1.  **Define Schema**: Write `prisma/schema.prisma`.
2.  **Generate Client**: Run `npx prisma generate`.
3.  **Setup Database Service**: Implement the service class that connects Prisma to the correct `sqlite` file at runtime.
4.  **Refactor Logger**: Replace file IO in `InstanceLoggerService` with DB calls.
5.  **Initialize DB**: Ensure the DB file is created/migrated on app launch.

## 6. Double Check Strategy

- **Verification**:
  - Launch app.
  - Check if `database.sqlite` is created in the configured folder.
  - "Join" an instance (or simulate location change).
  - Verify a new row exists in the `Session` table.
  - Verify logs appear in the `LogEntry` table.
- **Fallback**:
  - If DB initialization fails, log error to console (and optionally fallback to memory for that session, but DB is critical).

---

**Status**: Ready to Execute.
