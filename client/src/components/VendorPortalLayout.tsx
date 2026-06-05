/**
 * VendorPortalLayout
 * Token-based auth wrapper for the vendor portal.
 * Reads token from URL (?token=...) or localStorage, validates it,
 * and provides vendor context to all child pages.
 *
 * Mobile: bottom tab bar with safe-area padding.
 * Desktop: left sidebar (unchanged).
 */
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  ClipboardList,
  Package,
  FileText,
  MessageSquare,
  LogOut,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const GOLD = "#BF9A3B";
const DARK = "#1A1B17";
const CREAM = "#F5F0E8";
const MUTED = "#9B9B8B";
const CHARCOAL = "#2A2B26";
const CHARCOAL_DARK = "#1E1F1A";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

const TOKEN_KEY = "kp_vendor_token";

// ─── Context ──────────────────────────────────────────────────────────────────

interface VendorSession {
  vendor: {
    id: number;
    companyName: string | null;
    trade: string | null;
    companyEmail: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    notes: string | null;
    tier: string | null;
  };
  sessionId: number;
  token: string;
}

const VendorPortalContext = createContext<VendorSession | null>(null);

export function useVendorPortal(): VendorSession {
  const ctx = useContext(VendorPortalContext);
  if (!ctx) throw new Error("useVendorPortal must be used inside VendorPortalLayout");
  return ctx;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: ClipboardList, label: "Quotes",    path: "/vendor/quotes" },
  { icon: Package,       label: "Orders",    path: "/vendor/purchase-orders" },
  { icon: FileText,      label: "Invoices",  path: "/vendor/invoices" },
  { icon: FileText,      label: "Compliance",path: "/vendor/compliance" },
  { icon: MessageSquare, label: "Messages",  path: "/vendor/messages" },
];

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

function VendorSidebar({
  vendor,
  onLogout,
}: {
  vendor: VendorSession["vendor"];
  onLogout: () => void;
}) {
  const [location, navigate] = useLocation();

  return (
    <aside
      className="hidden md:flex flex-col h-screen sticky top-0 shrink-0"
      style={{
        width: 240,
        background: CHARCOAL_DARK,
        borderRight: "1px solid rgba(191,154,59,0.15)",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(191,154,59,0.15)" }}>
        <img src={LOGO_URL} alt="Kitchens Plus" className="h-8 object-contain" />
      </div>

      {/* Vendor info */}
      <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: "rgba(191,154,59,0.15)", color: GOLD }}>
            {vendor.companyName?.slice(0, 2).toUpperCase() ?? "V"}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: CREAM }}>
              {vendor.companyName ?? "Vendor"}
            </p>
            {vendor.trade && (
              <p className="text-xs truncate" style={{ color: MUTED }}>{vendor.trade}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || location.startsWith(item.path + "/");
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 w-full px-5 py-3 text-left transition-colors"
              style={{
                background: isActive ? "rgba(191,154,59,0.12)" : "transparent",
                color: isActive ? GOLD : CREAM,
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                borderLeft: isActive ? `2px solid ${GOLD}` : "2px solid transparent",
              }}
            >
              <item.icon className="h-4 w-4 shrink-0" style={{ color: isActive ? GOLD : MUTED }} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm w-full"
          style={{ color: MUTED }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ─── Mobile Bottom Tab Bar ────────────────────────────────────────────────────

function VendorBottomTabBar({ onLogout }: { onLogout: () => void }) {
  const [location, navigate] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-stretch"
      style={{
        background: CHARCOAL_DARK,
        borderTop: "1px solid rgba(191,154,59,0.2)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.path || location.startsWith(item.path + "/");
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-colors"
            style={{ color: isActive ? GOLD : MUTED }}
            aria-label={item.label}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </button>
        );
      })}
      {/* Logout tab */}
      <button
        onClick={onLogout}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-colors"
        style={{ color: MUTED }}
        aria-label="Sign out"
      >
        <LogOut className="h-5 w-5 shrink-0" />
        <span className="text-[10px] font-medium leading-none">Sign out</span>
      </button>
    </nav>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  const search = useSearch();
  const [, navigate] = useLocation();

  // Read token from URL or localStorage
  const urlToken = new URLSearchParams(search).get("token");
  const [token, setToken] = useState<string | null>(() => {
    if (urlToken) return urlToken;
    return localStorage.getItem(TOKEN_KEY);
  });

  // Persist token from URL to localStorage
  useEffect(() => {
    if (urlToken) {
      localStorage.setItem(TOKEN_KEY, urlToken);
      setToken(urlToken);
    }
  }, [urlToken]);

  const queryInput = useMemo(() => ({ token: token ?? "" }), [token]);
  const { data: session, isLoading, error } = trpc.vms.vendorPortal.validateToken.useQuery(
    queryInput,
    { enabled: !!token }
  );

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  // No token
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: DARK }}>
        <div className="max-w-md w-full text-center">
          <img src={LOGO_URL} alt="Kitchens Plus" className="h-12 object-contain mx-auto mb-8" />
          <AlertTriangle className="h-12 w-12 mx-auto mb-4" style={{ color: MUTED, opacity: 0.5 }} />
          <h2 className="text-xl font-semibold mb-2" style={{ color: CREAM }}>Access Required</h2>
          <p className="text-sm" style={{ color: MUTED }}>
            Please use the link from your invitation email to access the vendor portal.
          </p>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: DARK }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  // Invalid/expired token
  if (!session || error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: DARK }}>
        <div className="max-w-md w-full text-center">
          <img src={LOGO_URL} alt="Kitchens Plus" className="h-12 object-contain mx-auto mb-8" />
          <AlertTriangle className="h-12 w-12 mx-auto mb-4" style={{ color: "#EF5350", opacity: 0.7 }} />
          <h2 className="text-xl font-semibold mb-2" style={{ color: CREAM }}>Link Expired</h2>
          <p className="text-sm mb-6" style={{ color: MUTED }}>
            This portal link has expired or is invalid. Please contact Kitchens Plus to request a new link.
          </p>
          <p className="text-sm font-medium" style={{ color: GOLD }}>+1 (833) 518-4811</p>
          <Button variant="ghost" className="mt-4 text-xs" style={{ color: MUTED }} onClick={handleLogout}>
            Clear saved session
          </Button>
        </div>
      </div>
    );
  }

  const vendorSession: VendorSession = {
    vendor: session.vendor as VendorSession["vendor"],
    sessionId: session.sessionId,
    token,
  };

  return (
    <VendorPortalContext.Provider value={vendorSession}>
      <div className="flex min-h-screen" style={{ background: CHARCOAL_DARK }}>
        {/* Desktop sidebar */}
        <VendorSidebar vendor={vendorSession.vendor} onLogout={handleLogout} />

        {/* Main content — add bottom padding on mobile so content isn't hidden behind the tab bar */}
        <main className="flex-1 min-w-0 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <VendorBottomTabBar onLogout={handleLogout} />
      </div>
    </VendorPortalContext.Provider>
  );
}
