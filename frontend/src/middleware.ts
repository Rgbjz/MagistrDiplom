import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const authPages =
    pathname.startsWith('/login') || pathname.startsWith('/register');
  const publicPage =
    authPages ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/confirm');

  if (!req.auth && !publicPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (req.auth && authPages) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
};
