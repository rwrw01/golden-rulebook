import { z } from 'zod';

export const ModeSchema = z.enum(['sparring', 'coaching', 'masterclass']);
export type Mode = z.infer<typeof ModeSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), mode: ModeSchema, pitch: z.string().min(1) }),
  z.object({ type: z.literal('message'), text: z.string().min(1) }),
  z.object({ type: z.literal('end') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type ServerMessage =
  | { type: 'status'; status: 'checking' | 'spawning' | 'ready' | 'error'; detail?: string }
  | { type: 'chunk'; text: string }
  | { type: 'message_end' }
  | { type: 'session_end'; memoAvailable: boolean }
  | { type: 'error'; message: string };

export interface Session {
  id: string;
  pid: number | undefined;
  messages: string[];
  active: boolean;
}
