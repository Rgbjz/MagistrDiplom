import { auth } from './auth';
import { NextResponse } from 'next/server';

const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];
const PUBLIC_PREFIXES = ['/welcome', '/catalog', '/c/', '/certificates/', '/confirm', '/privacy'];
// Signed-in sections (app/(app)); a guest is sent to /login only for these,
// any other unknown path gets the regular 404.
const PROTECTED_PREFIXES = [
  '/admin',
  '/calendar',
  '/chat',
  '/checkout',
  '/courses',
  '/my-courses',
  '/notifications',
  '/profile',
  '/purchases',
  '/teacher',
];
const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  const isPublic =
    isAuthPage || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user) {
    // Guests see the marketing home at "/".
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/welcome', req.url));
    }
    if (!isPublic && PROTECTED_PREFIXES.some((p) => under(pathname, p))) {
      const login = new URL('/login', req.url);
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (isAuthPage || pathname === '/welcome') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname === '/' && user.role === 'ADMIN') {
    return NextResponse.redirect(new URL('/admin', req.url));
  }
  if (pathname.startsWith('/admin') && user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/teacher') && user.role === 'STUDENT') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
};
