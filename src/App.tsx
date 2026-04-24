import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ROUTE_PATHS } from "@/lib/index";
import { useAuth } from "@/hooks/useAuth";
import InboxPage from "@/pages/Inbox";
import AllInboxPage from "@/pages/AllInboxPage";
import { FolderPage } from "@/pages/FolderPage";
import SearchPage from "@/pages/SearchPage";
import DomainsPage from "@/pages/DomainsPage";
import AccountsPage from "@/pages/AccountsPage";
import SettingsPage from "@/pages/SettingsPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import NotFound from "./pages/not-found/Index";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-8 h-8 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  return <>{children}</>;
}

const AppShell = ({ children }: { children: React.ReactNode }) => (
  <AuthGuard><Layout>{children}</Layout></AuthGuard>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path={ROUTE_PATHS.LOGIN} element={<LoginPage />} />
          <Route path={ROUTE_PATHS.RESET_PASSWORD} element={<ResetPasswordPage />} />
          <Route path={ROUTE_PATHS.ALL_INBOX} element={<AppShell><AllInboxPage /></AppShell>} />
          <Route path={ROUTE_PATHS.INBOX} element={<AppShell><InboxPage /></AppShell>} />
          <Route path={ROUTE_PATHS.SENT} element={<AppShell><FolderPage folder="sent" title="Sent" emptyMessage="No sent emails." /></AppShell>} />
          <Route path={ROUTE_PATHS.DRAFTS} element={<AppShell><FolderPage folder="drafts" title="Drafts" emptyMessage="No drafts saved." /></AppShell>} />
          <Route path={ROUTE_PATHS.SPAM} element={<AppShell><FolderPage folder="spam" title="Spam" emptyMessage="No spam here!" /></AppShell>} />
          <Route path={ROUTE_PATHS.TRASH} element={<AppShell><FolderPage folder="trash" title="Trash" emptyMessage="Trash is empty." /></AppShell>} />
          <Route path={ROUTE_PATHS.SEARCH} element={<AppShell><SearchPage /></AppShell>} />
          <Route path={ROUTE_PATHS.DOMAINS} element={<AppShell><DomainsPage /></AppShell>} />
          <Route path={ROUTE_PATHS.ACCOUNTS} element={<AppShell><AccountsPage /></AppShell>} />
          <Route path={ROUTE_PATHS.SETTINGS} element={<AppShell><SettingsPage /></AppShell>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
