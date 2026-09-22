import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { Shell } from "./Shell";
import { AccountPage } from "../features/account/AccountPage";
import { JobsPage } from "../features/jobs/JobsPage";
import { JobDetailPage } from "../features/jobs/JobDetailPage";
import { OutreachPage } from "../features/jobs/OutreachPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";

function AppRoutes() {
  const { isLoading, needsSetup, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-slate-500 uppercase tracking-[0.2em]">
        Loading…
      </div>
    );
  }

  if (needsSetup) return <RegisterPage />;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/jobs" replace />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="jobs/:id/outreach" element={<OutreachPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return <AppRoutes />;
}
