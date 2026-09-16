import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { AccountPage } from "../features/account/AccountPage";
import { JobsPage } from "../features/jobs/JobsPage";
import { JobDetailPage } from "../features/jobs/JobDetailPage";
import { OutreachPage } from "../features/jobs/OutreachPage";

export function App() {
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
