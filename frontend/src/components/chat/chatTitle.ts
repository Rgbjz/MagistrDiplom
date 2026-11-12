import type { Conversation } from '../../lib/types';

/** Backend prefixes course chats with "Course: " — show just the course name. */
export function conversationTitle(c: Conversation): string {
  return c.title.replace(/^Course:\s*/, '');
}
