/**
 * ClientPortalLayout — completely independent of Manus OAuth / owner auth.
 * Reads only the kp_client_session cookie via trpc.clientPortal.me.
 * This ensures that even when Chad (owner) is logged in on the same browser,
 * clients see the correct client portal sidebar and not the owner dashboard.
 *
 * Mobile: bottom tab bar (safe-area aware, 56px tap targets)
 * Desktop: sidebar navigation (unchanged)
 */
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Home,
  ScrollText,
  CreditCard,
  MessageSquare,
  FolderOpen,
  Sparkles,
  LogOut,
  PanelLeft,
  ChevronRight,
  Phone,
  MoreHorizontal,
} from "lucide-react";
import { CSSProperties, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

const GOLD = "#C9A84C";
const DARK = "#1A1B17";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";

const clientMenuItems = [
  { icon: Home, label: "Projects", path: "/client/projects" },
  { icon: ScrollText, label: "Proposals", path: "/client/proposals" },
  { icon: CreditCard, label: "Payments", path: "/client/payments" },
  { icon: MessageSquare, label: "Messages", path: "/client/messages" },
  { icon: FolderOpen, label: "Documents", path: "/client/documents" },
  { icon: Sparkles, label: "Inspiration", path: "/client/inspiration" },
];

// Bottom tab bar shows the 5 most important items; "More" opens the sidebar for the rest
const BOTTOM_TAB_ITEMS = clientMenuItems.slice(0, 5);

const SIDEBAR_WIDTH_KEY = "client-sidebar-width";
const DEFAULT_WIDTH = 248;

export default function ClientPortalLayout({
  children,
  clientName,
  onLogout,
}: {
  children: React.ReactNode;
  clientName: string;
  onLogout: () => void;
}) {
  const [sidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <ClientPortalLayoutContent
        clientName={clientName}
        onLogout={onLogout}
      >
        {children}
      </ClientPortalLayoutContent>
    </SidebarProvider>
  );
}

function ClientPortalLayoutContent({
  children,
  clientName,
  onLogout,
}: {
  children: React.ReactNode;
  clientName: string;
  onLogout: () => void;
}) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();

  // ── Add to Home Screen banner (iOS Safari only) ──
  const [showA2HS, setShowA2HS] = useState(false);
  useEffect(() => {
    // Show only on iOS Safari, not already in standalone mode, and not previously dismissed
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone === true;
    const dismissed = localStorage.getItem("kp_a2hs_dismissed");
    if (isIOS && !isStandalone && !dismissed) {
      setShowA2HS(true);
    }
  }, []);

  const logoutMutation = trpc.clientPortal.logout.useMutation({
    onSuccess: () => onLogout(),
  });

  const activeItem = clientMenuItems.find(
    (item) => location === item.path || location.startsWith(item.path + "/")
  );

  const initials = clientName
    ? clientName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "C";

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────── */}
      <Sidebar
        collapsible="icon"
        className="border-r hidden md:flex"
        style={{
          background: DARK,
          borderColor: "rgba(255,255,255,0.07)",
        }}
      >
        {/* Header */}
        <SidebarHeader
          className="h-16 justify-center border-b px-3"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={toggleSidebar}
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
              style={{ color: MUTED }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              aria-label="Toggle navigation"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            {!isCollapsed && (
              <img
                src={LOGO_URL}
                alt="Kitchens Plus"
                className="h-8 object-contain"
                style={{ filter: "brightness(1.1)" }}
              />
            )}
          </div>
        </SidebarHeader>

        {/* Client identity strip */}
        {!isCollapsed && (
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(201,168,76,0.05)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: GOLD }}>
              Your Renovation
            </p>
            <p className="text-sm font-semibold leading-tight" style={{ color: CREAM }}>
              {clientName || "Welcome"}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
              Project Dashboard
            </p>
          </div>
        )}

        {/* Navigation */}
        <SidebarContent className="gap-0 py-2">
          {!isCollapsed && (
            <p
              className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(154,149,137,0.5)" }}
            >
              Navigation
            </p>
          )}
          <SidebarMenu className="px-2">
            {clientMenuItems.map((item) => {
              const isActive =
                location === item.path || location.startsWith(item.path + "/");
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-9 transition-all font-normal text-sm"
                    style={
                      isActive
                        ? {
                            background: `rgba(201,168,76,0.15)`,
                            color: GOLD,
                            fontWeight: 600,
                            border: `1px solid rgba(201,168,76,0.25)`,
                          }
                        : {
                            color: MUTED,
                            border: "1px solid transparent",
                          }
                    }
                  >
                    <item.icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: isActive ? GOLD : MUTED }}
                    />
                    <span className="truncate">{item.label}</span>
                    {isActive && !isCollapsed && (
                      <ChevronRight className="ml-auto h-3 w-3" style={{ color: `${GOLD}80` }} />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        {/* Help contact */}
        {!isCollapsed && (
          <div
            className="mx-3 mb-2 rounded-lg px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>
              Need Help?
            </p>
            <a
              href="tel:18645678777"
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: GOLD }}
            >
              <Phone className="h-3 w-3" />
              (864) 567-8777
            </a>
          </div>
        )}

        {/* Footer */}
        <SidebarFooter
          className="p-3 border-t"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 w-full">
            <Avatar className="h-8 w-8 shrink-0" style={{ border: `1.5px solid rgba(201,168,76,0.4)` }}>
              <AvatarFallback
                className="text-xs font-bold"
                style={{ background: `rgba(201,168,76,0.15)`, color: GOLD }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-none" style={{ color: CREAM }}>
                    {clientName || "Client"}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                    Your Portal
                  </p>
                </div>
                <button
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
                  style={{ color: MUTED }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(224,82,82,0.15)";
                    (e.currentTarget as HTMLElement).style.color = "#E05252";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = MUTED;
                  }}
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* ── Main content area ────────────────────────────────────────────── */}
      <SidebarInset style={{ background: "var(--background)" }} className="md:flex-1">
        {/* Mobile top bar — shows logo + current page title */}
        {isMobile && (
          <div
            className="flex h-14 items-center justify-between px-4 sticky top-0 z-40 border-b"
            style={{
              background: DARK,
              borderColor: "rgba(255,255,255,0.07)",
              paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            }}
          >
            <img
              src={LOGO_URL}
              alt="Kitchens Plus"
              className="h-7 object-contain"
            />
            <span className="text-sm font-medium" style={{ color: CREAM }}>
              {activeItem?.label ?? "Portal"}
            </span>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="h-9 w-9 flex items-center justify-center rounded-lg"
              style={{ color: MUTED }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Page content — add bottom padding on mobile to clear the tab bar */}
        <main className={`flex-1 p-4 md:p-6 ${isMobile ? "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]" : ""}`}>
          {/* Add to Home Screen banner (iOS Safari only) */}
          {showA2HS && (
            <div
              className="mb-4 rounded-xl p-4 flex items-start gap-3 relative"
              style={{
                background: `linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04))`,
                border: `1px solid rgba(201,168,76,0.2)`,
              }}
            >
              <Sparkles className="h-5 w-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: CREAM }}>
                  Add to your Home Screen
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: MUTED }}>
                  Tap the <strong style={{ color: CREAM }}>Share</strong> button{" "}
                  <span style={{ fontSize: "14px", lineHeight: 1 }}>⬆️</span> at the bottom of Safari,{" "}
                  then tap <strong style={{ color: CREAM }}>Add to Home Screen</strong> for quick access.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowA2HS(false);
                  localStorage.setItem("kp_a2hs_dismissed", "1");
                }}
                className="h-6 w-6 flex items-center justify-center rounded-full shrink-0"
                style={{ color: MUTED, background: "rgba(255,255,255,0.06)" }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </main>
      </SidebarInset>

      {/* ── Mobile bottom tab bar (mobile only) ─────────────────────────── */}
      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-stretch"
          style={{
            background: DARK,
            borderTop: "1px solid rgba(255,255,255,0.09)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
          }}
          aria-label="Client portal navigation"
        >
          {BOTTOM_TAB_ITEMS.map((item) => {
            const isActive = location === item.path || location.startsWith(item.path + "/");
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:opacity-70"
                style={{
                  color: isActive ? GOLD : MUTED,
                  background: "transparent",
                  WebkitTapHighlightColor: "transparent",
                }}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon
                  className="h-5 w-5 shrink-0"
                  style={{
                    color: isActive ? GOLD : MUTED,
                    filter: isActive ? `drop-shadow(0 0 6px ${GOLD}60)` : "none",
                  }}
                />
                <span
                  className="text-[10px] font-medium leading-none"
                  style={{ color: isActive ? GOLD : MUTED }}
                >
                  {item.label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <span
                    className="absolute top-1.5 w-1 h-1 rounded-full"
                    style={{ background: GOLD }}
                  />
                )}
              </button>
            );
          })}
          {/* "More" tab for the 6th item (Inspiration) */}
          <button
            onClick={() => setLocation("/client/inspiration")}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:opacity-70"
            style={{
              color: location.startsWith("/client/inspiration") ? GOLD : MUTED,
              background: "transparent",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Inspiration"
          >
            <Sparkles
              className="h-5 w-5 shrink-0"
              style={{
                color: location.startsWith("/client/inspiration") ? GOLD : MUTED,
                filter: location.startsWith("/client/inspiration") ? `drop-shadow(0 0 6px ${GOLD}60)` : "none",
              }}
            />
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: location.startsWith("/client/inspiration") ? GOLD : MUTED }}
            >
              Inspiration
            </span>
          </button>
        </nav>
      )}
    </>
  );
}
