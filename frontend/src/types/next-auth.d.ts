import type { DefaultSession } from 'next-auth';
import type { Role } from '../lib/types';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      id: number;
      role: Role;
    } & DefaultSession['user'];
  }

  // Extend the default user (which already has id/email/name/image)
  interface User {
    role: Role;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: number;
    role: Role;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    error?: string;
  }
}
