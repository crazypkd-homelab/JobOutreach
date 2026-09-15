import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { AccountPage } from "../features/account/AccountPage";
import { JobsPage } from "../features/jobs/JobsPage";
import { JobDetailPage } from "../features/jobs/JobDetailPage";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
