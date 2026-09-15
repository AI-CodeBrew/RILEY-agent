import {
  Bot,
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MessageSquareWarning,
  MessagesSquare,
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
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/inbound-calls", label: "Inbound calls", icon: PhoneIncoming },
  // Hidden from agents for now — re-enable by dropping adminOnly once ready.
  { href: "/forum", label: "Forum", icon: MessagesSquare, adminOnly: true },
  { href: "/inbox", label: "Chats", icon: MessageCircle, adminOnly: true },
  { href: "/agents", label: "Sales Agents", icon: UserRound, adminOnly: true },
  { href: "/contact-requests", label: "Contact Requests", icon: Mail, adminOnly: true },
  { href: "/ai-integration", label: "AI Integration", icon: Bot, agentOnly: true },
  { href: "/rebuttals", label: "Rebuttals", icon: MessageSquareWarning, agentOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * `hasCalendarAccess` only ever excludes the Calendar link — it's true for
 * admins (not billing-gated at all) and for every plan except an actively
 * subscribed Standard ($5, no calendar — see lib/billing.ts's
 * planIncludesCalendar). Default true so nothing changes for callers that
 * don't pass it (e.g. before an agent has any billing row yet).
 */
export function visibleNavLinks(isAdmin: boolean, hasCalendarAccess = true) {
  return NAV_LINKS.filter((link) => {
    if (link.adminOnly && !isAdmin) return false;
    if (link.agentOnly && isAdmin) return false;
    if (link.href === "/calendar" && !hasCalendarAccess) return false;
    return true;
  });
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
