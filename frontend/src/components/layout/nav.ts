import type { Role } from '../../lib/types';

/** Keys of the `nav.items` messages. */
export type NavLabel =
  | 'home' | 'myCourses' | 'catalog' | 'chat' | 'purchases' | 'admin'
  | 'adminShort' | 'createCourse' | 'createShort' | 'coursesShort' | 'profile'
  | 'calendar';

export interface NavItem {
  href: string;
  label: NavLabel;
  icon: 'home' | 'book' | 'compass' | 'chat' | 'bag' | 'plus' | 'shield' | 'user' | 'calendar';
}

export function desktopNav(role: Role): NavItem[] {
  if (role === 'ADMIN') {
    return [
      { href: '/admin', label: 'admin', icon: 'shield' },
      { href: '/catalog', label: 'catalog', icon: 'compass' },
      { href: '/chat', label: 'chat', icon: 'chat' },
    ];
  }
  if (role === 'TEACHER') {
    return [
      { href: '/', label: 'home', icon: 'home' },
      { href: '/teacher/courses/new', label: 'createCourse', icon: 'plus' },
      { href: '/calendar', label: 'calendar', icon: 'calendar' },
      { href: '/catalog', label: 'catalog', icon: 'compass' },
      { href: '/chat', label: 'chat', icon: 'chat' },
    ];
  }
  return [
    { href: '/', label: 'home', icon: 'home' },
    { href: '/my-courses', label: 'myCourses', icon: 'book' },
    { href: '/calendar', label: 'calendar', icon: 'calendar' },
    { href: '/catalog', label: 'catalog', icon: 'compass' },
    { href: '/chat', label: 'chat', icon: 'chat' },
    { href: '/purchases', label: 'purchases', icon: 'bag' },
  ];
}

export function mobileNav(role: Role): NavItem[] {
  const first: NavItem[] =
    role === 'ADMIN'
      ? [
          { href: '/admin', label: 'adminShort', icon: 'shield' },
          { href: '/catalog', label: 'catalog', icon: 'compass' },
        ]
      : role === 'TEACHER'
        ? [
            { href: '/', label: 'home', icon: 'home' },
            { href: '/teacher/courses/new', label: 'createShort', icon: 'plus' },
          ]
        : [
            { href: '/', label: 'home', icon: 'home' },
            { href: '/my-courses', label: 'coursesShort', icon: 'book' },
          ];
  return [
    ...first,
    { href: '/chat', label: 'chat', icon: 'chat' },
    { href: '/profile', label: 'profile', icon: 'user' },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}
