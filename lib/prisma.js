import dotenv from 'dotenv';
dotenv.config();

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
        console.error("🔴 [lib/prisma.js] DATABASE_URL not configured");
        throw new Error('DATABASE_URL not configured');
    }

    console.log("🔵 [lib/prisma.js] DATABASE_URL found:", connectionString ? connectionString.slice(0, 30) + "..." : "empty");

    // Create client with direct datasource config
    return new PrismaClient({
        datasources: {
            db: {
                url: connectionString
            }
        }
    });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export { prisma };