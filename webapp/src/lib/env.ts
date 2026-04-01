import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CLAUDE_PATH: z.string().default('claude'),
  MAX_SESSIONS: z.coerce.number().min(1).max(10).default(3),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
