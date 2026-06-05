import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  FileText,
  Calendar,
  MessageSquare,
  Package,
  BarChart3,
  Settings,
  LogOut,
  PanelLeft,
  Building2,
  ClipboardList,
  Wrench,
  Star,
  Bell,
  ChevronRight,
  Home,
  CreditCard,
  Camera,
  Menu,
  X,
  HardHat,
  Bot,
  Cpu,
  ClipboardCheck,
  Receipt,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

// Owner/Admin navigation
const ownerMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", section: "overview" },
  { icon: Camera, label: "Field Capture", path: "/field-capture", section: "overview" },
  { icon: Users, label: "Lead / Client", path: "/leads", section: "crm" },
  { icon: FileText, label: "Proposals", path: "/proposals", section: "crm" },
  { icon: CreditCard, label: "Invoices", path: "/invoices", section: "crm" },
  { icon: FolderOpen, label: "Projects", path: "/projects", section: "ops" },
  { icon: Calendar, label: "Schedule", path: "/schedule", section: "ops" },
  { icon: MessageSquare, label: "Messages", path: "/messages", section: "ops" },
  { icon: Building2, label: "Vendors", path: "/vendors", section: "ops" },
  { icon: HardHat, label: "Subcontractors", path: "/subcontractors", section: "ops" },
  { icon: ClipboardCheck, label: "RFQ Management", path: "/rfqs", section: "ops" },
  { icon: Package, label: "Purchase Orders", path: "/purchase-orders", section: "ops" },
  { icon: Receipt, label: "Vendor Invoices", path: "/vendor-invoices", section: "ops" },
  { icon: Users, label: "Crew", path: "/crew", section: "ops" },
  { icon: FolderOpen, label: "Documents", path: "/documents", section: "files" },
  { icon: BarChart3, label: "Reports", path: "/reports", section: "files" },
  { icon: Cpu, label: "COO Dashboard", path: "/owner/coo-dashboard", section: "ai" },
  { icon: Bot, label: "AI Approvals", path: "/agent-approvals", section: "ai" },
  { icon: Bot, label: "AI Activity", path: "/agent-activity", section: "ai" },
  { icon: Settings, label: "Settings", path: "/settings", section: "system" },
];

// Client navigation
const clientMenuItems = [
  { icon: Home, label: "My Project", path: "/client/project", section: "project" },
  { icon: ClipboardList, label: "Approvals", path: "/client/approvals", section: "project" },
  { icon: CreditCard, label: "Payments", path: "/client/payments", section: "project" },
  { icon: MessageSquare, label: "Messages", path: "/client/messages", section: "project" },
  { icon: FolderOpen, label: "Documents", path: "/client/documents", section: "project" },
];

// Vendor navigation
const vendorMenuItems = [
  { icon: ClipboardList, label: "Quote Requests", path: "/vendor/quotes", section: "work" },
  { icon: Package, label: "Purchase Orders", path: "/vendor/purchase-orders", section: "work" },
  { icon: Calendar, label: "Schedule", path: "/vendor/schedule", section: "work" },
  { icon: FileText, label: "Compliance Docs", path: "/vendor/compliance", section: "work" },
  { icon: MessageSquare, label: "Messages", path: "/vendor/messages", section: "work" },
];

// Crew navigation
const crewMenuItems = [
  { icon: FolderOpen, label: "My Jobs", path: "/crew/jobs", section: "work" },
  { icon: Calendar, label: "Schedule", path: "/crew/schedule", section: "work" },
  { icon: MessageSquare, label: "Messages", path: "/crew/messages", section: "work" },
];

// ── Mobile Floating Nav ─────────────────────────────────────────────────────
function MobileFloatingNav({
  menuItems,
  unreadCount,
  onNavigate,
}: {
  menuItems: typeof ownerMenuItems;
  unreadCount: number;
  onNavigate: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  const handleNav = useCallback((path: string) => {
    onNavigate(path);
    setOpen(false);
  }, [onNavigate]);

  // Group by section
  const sections = menuItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, typeof menuItems>);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[998] md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        className="fixed top-0 left-0 h-full z-[999] md:hidden flex flex-col overflow-y-auto"
        style={{
          width: "78vw",
          maxWidth: 320,
          background: "var(--kp-charcoal-dark, #1a1a18)",
          borderRight: "1px solid rgba(191,154,59,0.2)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.5)" : "none",
        }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "rgba(191,154,59,0.2)", paddingTop: "max(1rem, env(safe-area-inset-top, 0px))", paddingBottom: "1rem" }}>
          <img src={LOGO_URL} alt="Kitchens Plus" className="h-8 object-contain" />
          <button
            onClick={() => setOpen(false)}
            className="h-9 w-9 flex items-center justify-center rounded-lg"
            style={{ background: "rgba(255,255,255,0.07)" }}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" style={{ color: "var(--kp-cream, #f5f0e8)" }} />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex-1 py-3">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="mb-1">
              <p className="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(191,154,59,0.6)" }}>
                {sectionLabels[section] ?? section}
              </p>
              {items.map(item => {
                const isActive = location === item.path || location.startsWith(item.path + "/");
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNav(item.path)}
                    className="flex items-center gap-3 w-full px-5 py-3.5 text-left transition-colors"
                    style={{
                      background: isActive ? "rgba(191,154,59,0.15)" : "transparent",
                      color: isActive ? "var(--kp-gold, #BF9A3B)" : "var(--kp-cream, #f5f0e8)",
                      fontWeight: isActive ? 600 : 400,
                      fontSize: 15,
                    }}
                  >
                    <item.icon className="h-5 w-5 shrink-0" style={{ color: isActive ? "var(--kp-gold, #BF9A3B)" : "rgba(245,240,232,0.6)" }} />
                    <span className="flex-1">{item.label}</span>
                    {item.path === "/messages" && unreadCount > 0 && (
                      <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold text-white" style={{ background: "var(--kp-gold, #BF9A3B)" }}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed right-5 z-[997] md:hidden flex items-center justify-center rounded-full shadow-2xl"
        style={{
          width: 56,
          height: 56,
          bottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))",
          background: "var(--kp-gold, #BF9A3B)",
          color: "#1a1a18",
          boxShadow: "0 4px 20px rgba(191,154,59,0.5)",
        }}
        aria-label="Open navigation menu"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
    </>
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;

const sectionLabels: Record<string, string> = {
  overview: "Overview",
  crm: "CRM",
  ops: "Operations",
  files: "Files & Reports",
  ai: "AI & Intelligence",
  system: "System",
  project: "My Project",
  work: "Work",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--kp-charcoal-dark)" }}>
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-16 object-contain" />
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>
              Welcome Back
            </h1>
            <p className="text-sm" style={{ color: "var(--kp-muted)" }}>
              Sign in to access your Kitchens Plus Upstate dashboard.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full btn-gold px-8 py-3 text-sm font-semibold"
          >
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isClientRole = (user as any)?.role === "client";
  const clientLogout = trpc.clientPortal.logout.useMutation({
    onSuccess: () => { window.location.href = "/client/project"; },
  });
  const handleSignOut = isClientRole ? () => clientLogout.mutate() : logout;
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Unread message count for sidebar badge (admin/owner only)
  const isAdmin = ["admin", "owner"].includes((user as any)?.role ?? "");
  const { data: unreadData } = trpc.messages.getUnreadCount.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
  });
  const unreadCount = unreadData?.count ?? 0;
  // Pending RFI count for Projects nav badge (amber)
  const { data: rfiData } = trpc.rfi.countPendingAll.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
  });
  const pendingRfiCount = rfiData?.count ?? 0;
  // Pending AI approval count for AI Approvals nav badge (red/critical)
  const { data: approvalCountData } = trpc.agents.approvalQueue.count.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 60 * 1000, // refresh every 60 seconds
  });
  const pendingApprovalCount = approvalCountData?.count ?? 0;

  // Pick menu based on role
  const role = (user as any)?.role ?? "user";
  let menuItems = ownerMenuItems;
  if (role === "client") menuItems = clientMenuItems;
  else if (role === "vendor") menuItems = vendorMenuItems;
  else if (role === "crew") menuItems = crewMenuItems;

  // Group menu items by section
  const sections = menuItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, typeof menuItems>);

  const activeMenuItem = menuItems.find(item => location.startsWith(item.path));

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const roleLabel = role === "owner" || role === "admin" ? "Owner" :
    role === "client" ? "Client" :
    role === "vendor" ? "Vendor" :
    role === "crew" ? "Crew" : "User";

  const roleBadgeColor = role === "owner" || role === "admin" ? "var(--kp-gold)" :
    role === "client" ? "#5B9BD5" :
    role === "vendor" ? "#4CAF7D" : "#8A8B82";

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-border" disableTransition={isResizing}>
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-border px-3">
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
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

          {/* Navigation */}
          <SidebarContent className="gap-0 py-2">
            {Object.entries(sections).map(([section, items]) => (
              <div key={section} className="mb-1">
                {!isCollapsed && (
                  <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {sectionLabels[section] ?? section}
                  </p>
                )}
                <SidebarMenu className="px-2">
                  {items.map(item => {
                    const isActive = location === item.path || location.startsWith(item.path + "/");
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`h-9 transition-all font-normal text-sm ${
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "hover:bg-accent/50 text-foreground/80"
                          }`}
                        >
                          <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="truncate">{item.label}</span>
                          {item.path === "/messages" && unreadCount > 0 && !isCollapsed && (
                            <span className="ml-auto flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: "var(--kp-gold)" }}>
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                          {item.path === "/messages" && unreadCount > 0 && isCollapsed && (
                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full" style={{ background: "var(--kp-gold)" }} />
                          )}
                          {item.path === "/projects" && pendingRfiCount > 0 && !isCollapsed && (
                            <span className="ml-auto flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: "#D97706" }}>
                              {pendingRfiCount > 99 ? "99+" : pendingRfiCount}
                            </span>
                          )}
                          {item.path === "/projects" && pendingRfiCount > 0 && isCollapsed && (
                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full" style={{ background: "#D97706" }} />
                          )}
                          {item.path === "/agent-approvals" && pendingApprovalCount > 0 && !isCollapsed && (
                            <span className="ml-auto flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: "#EF4444" }}>
                              {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
                            </span>
                          )}
                          {item.path === "/agent-approvals" && pendingApprovalCount > 0 && isCollapsed && (
                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full" style={{ background: "#EF4444" }} />
                          )}
                          {isActive && !isCollapsed && unreadCount === 0 && (
                            <ChevronRight className="ml-auto h-3 w-3 text-primary/60" />
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 border border-border shrink-0">
                    <AvatarFallback
                      className="text-xs font-semibold"
                      style={{ background: "var(--kp-charcoal-light)", color: "var(--kp-gold)" }}
                    >
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-none">{user?.name ?? "User"}</p>
                      <p className="text-xs text-muted-foreground truncate mt-1"
                        style={{ color: roleBadgeColor, fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {roleLabel}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium">{user?.name ?? "User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </div>
                {!isClientRole && (
                  <>
                    <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {/* Mobile top bar */}
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <img src={LOGO_URL} alt="Kitchens Plus" className="h-7 object-contain" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              {activeMenuItem?.label ?? "Menu"}
            </span>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>

      {/* Mobile floating nav — only for owner/admin, hidden on desktop */}
      {isMobile && isAdmin && (
        <MobileFloatingNav
          menuItems={menuItems}
          unreadCount={unreadCount}
          onNavigate={setLocation}
        />
      )}
    </>
  );
}
