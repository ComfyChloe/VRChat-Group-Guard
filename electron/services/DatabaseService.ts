import { PrismaClient } from '@prisma/client';
import path from 'path';
import log from 'electron-log';
import { storageService } from './StorageService';
import fs from 'fs';

const logger = log.scope('DatabaseService');

class DatabaseService {
  private prisma: PrismaClient | null = null;
  private isInitialized = false;

  constructor() {}

  public async initialize() {
    if (this.isInitialized) return;

    try {
      const dataDir = storageService.getDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const dbPath = path.join(dataDir, 'database.sqlite');
      // Ensure file exists to avoid some driver oddities, though usually not needed
      if (!fs.existsSync(dbPath)) {
          fs.writeFileSync(dbPath, '');
      }

      const dbUrl = `file:${dbPath}`;
      
      logger.info(`Initializing database at: ${dbPath}`);

      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: dbUrl,
          },
        },
      });

      await this.ensureTables();
      this.isInitialized = true;
      logger.info('Database initialized successfully.');

    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async ensureTables() {
    if (!this.prisma) return;
    
    try {
      // Check if Session table exists
      const result = await this.prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='Session';`;
      if (Array.isArray(result) && result.length > 0) {
        return; // Tables exist
      }

      logger.info('Tables not found. Creating initial schema...');

      const statements = [
        `CREATE TABLE IF NOT EXISTS "Session" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "sessionId" TEXT NOT NULL,
            "worldId" TEXT NOT NULL,
            "instanceId" TEXT NOT NULL,
            "worldName" TEXT,
            "groupId" TEXT,
            "location" TEXT NOT NULL,
            "startTime" DATETIME NOT NULL,
            "endTime" DATETIME,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS "LogEntry" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "sessionId" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "timestamp" DATETIME NOT NULL,
            "actorDisplayName" TEXT,
            "actorUserId" TEXT,
            "details" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "LogEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("sessionId") ON DELETE CASCADE ON UPDATE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS "AutoModLog" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "timestamp" DATETIME NOT NULL,
            "user" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "groupId" TEXT NOT NULL,
            "action" TEXT NOT NULL,
            "reason" TEXT NOT NULL,
            "module" TEXT NOT NULL,
            "details" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionId_key" ON "Session"("sessionId");`
      ];

      for (const stmt of statements) {
        await this.prisma.$executeRawUnsafe(stmt);
      }
      
      logger.info('Schema created.');

    } catch (error) {
      logger.error('Error checking/creating tables:', error);
      throw error;
    }
  }

  public getClient() {
    // If called before init, try to init (though async issue)
    if (!this.prisma) {
        // This is dangerous if called synchronously logic depends on it.
        // But for now verify init in main.
      throw new Error('Database not initialized');
    }
    return this.prisma;
  }
  
  public async createSession(data: {
      sessionId: string, worldId: string, instanceId: string, location: string, 
      groupId: string | null, startTime: Date, worldName?: string
  }) {
      return this.getClient().session.create({ data });
  }

  public async updateSession(sessionId: string, data: Partial<{ endTime: Date, worldName: string }>) {
      return this.getClient().session.update({
          where: { sessionId },
          data
      });
  }

  public async createLogEntry(data: {
      sessionId: string, type: string, timestamp: Date, 
      actorDisplayName?: string, actorUserId?: string, details: unknown
  }) {
      return this.getClient().logEntry.create({
          data: {
              ...data,
              details: JSON.stringify(data.details)
          }
      });
  }

  public async createAutoModLog(data: {
      timestamp: Date, user: string, userId: string, groupId: string,
      action: string, reason: string, module: string, details?: string 
  }) {
        // Cast to any to avoid TS error until client is regenerated
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.getClient() as any).autoModLog.create({
          data: {
              ...data,
              id: require('crypto').randomUUID() // Ensure we generate ID if prisma middleware doesn't
          }
      });
  }

  public async getAutoModLogs() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.getClient() as any).autoModLog.findMany({
          orderBy: { timestamp: 'desc' }
      });
  }

  public async clearAutoModLogs() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.getClient() as any).autoModLog.deleteMany({});
  }

  public async getSessions(groupIdFilter?: string) {
      return this.getClient().session.findMany({
          where: groupIdFilter ? { groupId: groupIdFilter } : undefined,
          orderBy: { startTime: 'desc' }
      });
  }

  public async getSessionEvents(sessionId: string) {
      const logs = await this.getClient().logEntry.findMany({
          where: { sessionId },
          orderBy: { timestamp: 'asc' }
      });
      // Parse details back to JSON
      return logs.map(l => ({
          ...l,
          details: JSON.parse(l.details)
      }));
  }

  public async deleteAllSessions() {
      await this.getClient().logEntry.deleteMany({});
      return this.getClient().session.deleteMany({});
  }
}

export const databaseService = new DatabaseService();
