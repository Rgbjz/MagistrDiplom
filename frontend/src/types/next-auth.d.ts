import type { Role } from '../lib/types';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      id: number;
      email: string;
      role: Role;
    };
  }

  interface User {
    id: string;
    email: string;
    role: Role;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: number;
    email: string;
    role: Role;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    error?: string;
  }
}
