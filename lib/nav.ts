import {
  CalendarClock,
  LayoutDashboard,
  PhoneCall,
  PhoneIncoming,
  Radio,
  Settings,
  StickyNote,
  Users,
  UserRound,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  agentOnly?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/campaigns", label: "Auto-dial", icon: Radio, agentOnly: true },
  { href: "/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/calls", label: "Calls", icon: PhoneCall },
  { href: "/notes", label: "Call notes", icon: StickyNote },
  { href: "/inbound-calls", label: "Inbound calls", icon: PhoneIncoming },
  { href: "/agents", label: "Sales Agents", icon: UserRound, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function visibleNavLinks(isAdmin: boolean) {
  return NAV_LINKS.filter((link) => {
    if (link.adminOnly && !isAdmin) return false;
    if (link.agentOnly && isAdmin) return false;
    return true;
  });
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
