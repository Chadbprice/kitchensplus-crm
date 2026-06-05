import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

// Owner pages
import Home from "./pages/Home";
import Dashboard from "./pages/owner/Dashboard";
import Leads from "./pages/owner/Leads";
import Projects from "./pages/owner/Projects";
import ProjectDetail from "./pages/owner/ProjectDetail";
import Estimates from "./pages/owner/Estimates";
import Proposals from "./pages/owner/Proposals";
import EstimateDetail from "./pages/owner/EstimateDetail";
import Invoices from "./pages/owner/Invoices";
import Schedule from "./pages/owner/Schedule";
import Messages from "./pages/owner/Messages";
import Vendors from "./pages/owner/Vendors";
import VendorDetail from "./pages/owner/VendorDetail";
import PurchaseOrders from "./pages/owner/PurchaseOrders";
import Crew from "./pages/owner/Crew";
import Documents from "./pages/owner/Documents";
import Reports from "./pages/owner/Reports";
import OwnerSettings from "./pages/owner/Settings";
import FieldCapture from "./pages/owner/FieldCapture";
import FieldCaptureSession from "./pages/owner/FieldCaptureSession";
import FieldCaptureGallery from "./pages/owner/FieldCaptureGallery";
import TaskResponsePage from "./pages/TaskResponsePage";
import RFIResponsePage from "./pages/RFIResponsePage";
import ChangeOrderApprove from "./pages/ChangeOrderApprove";

// Client portal pages
import ClientInspirationGallery from "@/pages/client/ClientInspirationGallery";
import ClientProposals from "@/pages/client/ClientProposals";
import ClientProjects from "@/pages/client/ClientProjects";
import ClientProject from "@/pages/client/ClientProject";
import ClientApprovals from "@/pages/client/ClientApprovals";
import ClientPayments from "@/pages/client/ClientPayments";
import ClientMessages from "@/pages/client/ClientMessages";
import ClientDocuments from "@/pages/client/ClientDocuments";
import ClientMagicLink from "@/pages/client/ClientMagicLink";
import ClientProposalView from "@/pages/client/ClientProposalView";
import ClientPhoneLogin from "@/pages/client/ClientPhoneLogin";
import ClientReschedule from "@/pages/client/ClientReschedule";
import ConfirmMeeting from "@/pages/client/ConfirmMeeting";
import RescheduleConfirm from "@/pages/RescheduleConfirm";
import SignContract from "@/pages/client/SignContract";
import ClientPortalLayout from "@/components/ClientPortalLayout";
import { trpc } from "./lib/trpc";
import React from "react";

// AI Agent pages
import AgentApprovals from "./pages/owner/AgentApprovals";
import AgentActivity from "./pages/owner/AgentActivity";
import COODashboard from "./pages/owner/COODashboard";

// Subcontractor pages
import Subcontractors from "./pages/owner/Subcontractors";
import SubcontractorDetail from "./pages/owner/SubcontractorDetail";
import SubcontractorPortal from "./pages/subcontractor/SubcontractorPortal";
import RFQManagement from "./pages/owner/RFQManagement";
import VendorInvoiceReview from "./pages/owner/VendorInvoiceReview";

// Vendor portal pages
import VendorRFQResponse from "./pages/vendor/VendorRFQResponse";
import VendorQuotes from "./pages/vendor/VendorQuotes";
import VendorPurchaseOrders from "./pages/vendor/VendorPurchaseOrders";
import VendorSchedule from "./pages/vendor/VendorSchedule";
import VendorCompliance from "./pages/vendor/VendorCompliance";
import VendorMessages from "./pages/vendor/VendorMessages";
import VendorInvoices from "./pages/vendor/VendorInvoices";
import VendorPortalLayout from "./components/VendorPortalLayout";

function OwnerRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/estimates" component={Estimates} />
        <Route path="/estimates/:id" component={EstimateDetail} />
        <Route path="/proposals" component={Proposals} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/messages" component={Messages} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/vendors/:id" component={VendorDetail} />
        <Route path="/subcontractors" component={Subcontractors} />
        <Route path="/subcontractors/:id" component={SubcontractorDetail} />
        <Route path="/rfqs" component={RFQManagement} />
        <Route path="/purchase-orders" component={PurchaseOrders} />
        <Route path="/vendor-invoices" component={VendorInvoiceReview} />
        <Route path="/crew" component={Crew} />
        <Route path="/documents" component={Documents} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={OwnerSettings} />
        <Route path="/field-capture" component={FieldCapture} />
        <Route path="/field-capture/:clientId" component={FieldCaptureSession} />
        <Route path="/field-gallery/:clientId" component={FieldCaptureGallery} />
        <Route path="/owner/coo-dashboard" component={COODashboard} />
        <Route path="/agent-approvals" component={AgentApprovals} />
        <Route path="/agent-activity" component={AgentActivity} />
        <Route component={Dashboard} />
      </Switch>
    </DashboardLayout>
  );
}

function ClientRouter() {
  // optimisticSession: set immediately from loginWithPhone response to avoid
  // cookie round-trip timing issue where refetch() fires before Set-Cookie is committed.
  const [optimisticSession, setOptimisticSession] = React.useState<{ leadId: number; name: string } | null>(null);
  const { data: cookieSession, isLoading } = trpc.clientPortal.me.useQuery();
  const clientSession = optimisticSession ?? cookieSession;

  if (isLoading && !optimisticSession) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--kp-charcoal-dark)" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!clientSession) {
    return <ClientPhoneLogin onSuccess={(session) => setOptimisticSession(session)} />;
  }

  // Use ClientPortalLayout — completely independent of Manus OAuth / owner auth.
  // This ensures that even when Chad (owner) is logged in on the same browser,
  // clients see the correct client sidebar and not the owner dashboard.
  return (
    <ClientPortalLayout
      clientName={clientSession.name}
      onLogout={() => setOptimisticSession(null)}
    >
      <Switch>
        <Route path="/client/projects" component={ClientProjects} />
        <Route path="/client/project/:id" component={ClientProject} />
        <Route path="/client/project" component={ClientProject} />
        <Route path="/client/approvals" component={ClientApprovals} />
        <Route path="/client/proposals" component={ClientProposals} />
        <Route path="/client/payments" component={ClientPayments} />
        <Route path="/client/messages" component={ClientMessages} />
        <Route path="/client/documents" component={ClientDocuments} />
        <Route path="/client/inspiration" component={ClientInspirationGallery} />
        <Route path="/client/reschedule" component={ClientReschedule} />
        <Route component={ClientProjects} />
      </Switch>
    </ClientPortalLayout>
  );
}

function VendorRouter() {
  return (
    <VendorPortalLayout>
      <Switch>
        <Route path="/vendor/portal" component={VendorQuotes} />
        <Route path="/vendor/quotes" component={VendorQuotes} />
        <Route path="/vendor/purchase-orders" component={VendorPurchaseOrders} />
        <Route path="/vendor/invoices" component={VendorInvoices} />
        <Route path="/vendor/schedule" component={VendorSchedule} />
        <Route path="/vendor/compliance" component={VendorCompliance} />
        <Route path="/vendor/messages" component={VendorMessages} />
        <Route component={VendorQuotes} />
      </Switch>
    </VendorPortalLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public landing */}
      <Route path="/" component={Home} />
      {/* Magic link auth */}
      <Route path="/auth/magic" component={ClientMagicLink} />
      {/* Owner portal */}
      <Route path="/dashboard" component={OwnerRouter} />
      <Route path="/leads" component={OwnerRouter} />
      <Route path="/projects" component={OwnerRouter} />
      <Route path="/projects/:id" component={OwnerRouter} />
      <Route path="/owner/coo-dashboard" component={OwnerRouter} />
      <Route path="/agent-approvals" component={OwnerRouter} />
      <Route path="/agent-activity" component={OwnerRouter} />
      <Route path="/proposals" component={OwnerRouter} />
      <Route path="/invoices" component={OwnerRouter} />
      <Route path="/schedule" component={OwnerRouter} />
      <Route path="/messages" component={OwnerRouter} />
      <Route path="/vendors" component={OwnerRouter} />
      <Route path="/vendors/:id" component={OwnerRouter} />
      <Route path="/subcontractors" component={OwnerRouter} />
      <Route path="/subcontractors/:id" component={OwnerRouter} />
      <Route path="/rfqs" component={OwnerRouter} />
      <Route path="/purchase-orders" component={OwnerRouter} />
      <Route path="/vendor-invoices" component={OwnerRouter} />
      <Route path="/crew" component={OwnerRouter} />
      <Route path="/documents" component={OwnerRouter} />
      <Route path="/reports" component={OwnerRouter} />
      <Route path="/settings" component={OwnerRouter} />
      <Route path="/field-capture" component={OwnerRouter} />
      <Route path="/field-capture/:clientId" component={OwnerRouter} />
      <Route path="/field-gallery/:clientId" component={OwnerRouter} />
      {/* Client portal */}
      <Route path="/client/proposal/:id" component={ClientProposalView} />
      {/* Public task response page — no login required, linked from question task emails/SMS */}
      <Route path="/task-response/:token" component={TaskResponsePage} />
      {/* Public RFI response page — no login required, linked from RFI emails/SMS */}
      <Route path="/rfi/:token" component={RFIResponsePage} />
      {/* Public confirm-meeting page — no login required, linked from email */}
      <Route path="/client/confirm-meeting" component={ConfirmMeeting} />
      {/* Public sign-contract page — no login required, linked from deposit invoice email */}
      <Route path="/client/sign-contract/:token" component={SignContract} />
      {/* Public change order approval page — no login required, linked from change order email */}
      <Route path="/change-order/approve/:token" component={ChangeOrderApprove} />
      {/* Public reschedule confirmation page — no login required, linked from reschedule SMS/email */}
      <Route path="/reschedule-confirm" component={RescheduleConfirm} />
      <Route path="/client/:rest*" component={ClientRouter} />
      {/* Subcontractor portal */}
      <Route path="/subcontractor/:rest*" component={SubcontractorPortal} />
      {/* Vendor RFQ response — public, no auth */}
      <Route path="/vendor/rfq/:id" component={VendorRFQResponse} />
      {/* Vendor portal */}
      <Route path="/vendor/:rest*" component={VendorRouter} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
