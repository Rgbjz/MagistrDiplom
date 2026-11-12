import {
  BookOpen,
  CalendarDays,
  Compass,
  Home,
  MessageCircle,
  Plus,
  ShieldCheck,
  ShoppingBag,
  User,
} from 'lucide-react';
import type { NavItem } from './nav';

const ICONS = {
  home: Home,
  book: BookOpen,
  compass: Compass,
  chat: MessageCircle,
  bag: ShoppingBag,
  plus: Plus,
  shield: ShieldCheck,
  user: User,
  calendar: CalendarDays,
};

export function NavIcon({ name, size = 18 }: { name: NavItem['icon']; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden="true" />;
}
