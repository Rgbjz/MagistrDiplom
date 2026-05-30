import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith('/login') || pathname.startsWith('/register');
  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (req.auth && isPublic) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
};
