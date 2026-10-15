import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Spinner } from "@/components/ui/spinner";
import { AppShell } from "@/components/layout/AppShell";
import { EstimateTab } from "@/components/estimate/EstimateTab";
import { ExecuteTab } from "@/components/execute/ExecuteTab";
import { HomePage } from "@/pages/HomePage";
import { CalibratePage } from "@/pages/CalibratePage";
import { ReceiptTab } from "@/components/calibrate/ReceiptTab";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignInPage } from "@/pages/SignInPage";
import { RequireUnlocked, TicketPage } from "@/pages/TicketPage";

export default function App() {
  return (
    <>
      <AuthLoading>
        <div className="grid h-full place-items-center">
          <Spinner className="size-6 text-primary" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignInPage />
      </Unauthenticated>
      <Authenticated>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="calibrate" element={<CalibratePage />} />
              <Route path="t/:jiraKey" element={<TicketPage />}>
                <Route index element={<Navigate to="estimate" replace />} />
                <Route path="estimate" element={<EstimateTab />} />
                <Route
                  path="execute"
                  element={
                    <RequireUnlocked tab="execute">
                      <ExecuteTab />
                    </RequireUnlocked>
                  }
                />
                <Route
                  path="calibrate"
                  element={
                    <RequireUnlocked tab="calibrate">
                      <ReceiptTab />
                    </RequireUnlocked>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Authenticated>
    </>
  );
}
