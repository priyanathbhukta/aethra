// ==============================================================================
// AETHRA — Centralized Service Configuration Loader
// ==============================================================================

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().default(5432),
  user: z.string().default('postgres'),
  password: z.string().default('postgrespassword'),
  ssl: z.coerce.boolean().default(false),
  poolMin: z.coerce.number().default(2),
  poolMax: z.coerce.number().default(10),
});

export const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().default(6379),
  password: z.string().optional(),
});

export const KafkaConfigSchema = z.object({
  brokers: z.string().default('localhost:9092'),
  clientId: z.string().default('aethra-service'),
  ssl: z.coerce.boolean().default(false),
});

export const AppConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  awsRegion: z.string().default('ap-south-1'),
  jwtSecret: z.string().default('super-secret-dev-jwt-key-replace-in-production-min-32-chars'),
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  kafka: KafkaConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadAppConfig(serviceName: string, servicePort: number): AppConfig {
  return AppConfigSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env[`PORT_${serviceName.toUpperCase().replace(/-/g, '_')}`] || servicePort,
    logLevel: process.env.LOG_LEVEL,
    awsRegion: process.env.AWS_REGION,
    jwtSecret: process.env.JWT_SECRET,
    database: {
      host: process.env.DATABASE_HOST,
      port: process.env.DATABASE_PORT,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      ssl: process.env.DATABASE_SSL,
      poolMin: process.env.DATABASE_POOL_MIN,
      poolMax: process.env.DATABASE_POOL_MAX,
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD || undefined,
    },
    kafka: {
      brokers: process.env.KAFKA_BROKERS,
      clientId: `aethra-${serviceName}`,
      ssl: process.env.KAFKA_SSL,
    },
  });
}
