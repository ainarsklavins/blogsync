import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Configure WebSocket for serverless environment
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis;

function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not configured');
    }

    try {
        const pool = new Pool({
            connectionString,
            maxPoolSize: 1, // Recommended for serverless
            connectionTimeoutMillis: 15000, // 15 seconds
        });

        const adapter = new PrismaNeon(pool);
        return new PrismaClient({
            adapter,
            log: ['error'],
        });
    } catch (error) {
        console.error('Failed to initialize Prisma client:', error);
        throw error;
    }
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export { prisma };