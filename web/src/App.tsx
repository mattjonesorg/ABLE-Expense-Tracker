import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { AppLayout } from './components/AppShell';
import { Login } from './pages/Login';
import { OAuthCallback } from './pages/OAuthCallback';
import { Dashboard } from './pages/Dashboard';
import { Expenses } from './pages/Expenses';
import { ExpenseForm } from './pages/ExpenseForm';
import { Reimbursements } from './pages/Reimbursements';
import { Reports } from './pages/Reports';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Login page — no AppShell wrapper */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Protected routes — wrapped in AppShell */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/new" element={<ExpenseForm />} />
            <Route path="/reimbursements" element={<Reimbursements />} />
            <Route path="/reports" element={<Reports />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
