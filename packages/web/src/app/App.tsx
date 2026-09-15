import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { AccountPage } from "../features/account/AccountPage";
import { Placeholder } from "../components/Placeholder";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="jobs" element={<Placeholder module="JOBS" note="crawl a posting, extract the JD, score resumes, send outreach" />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
