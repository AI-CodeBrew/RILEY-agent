import {
  CalendarClock,
  LayoutDashboard,
  PhoneCall,
  Settings,
  Users,
  UserRound,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/calls", label: "Calls", icon: PhoneCall },
  { href: "/agents", label: "Sales Agents", icon: UserRound, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function visibleNavLinks(isAdmin: boolean) {
  return NAV_LINKS.filter((link) => !link.adminOnly || isAdmin);
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
