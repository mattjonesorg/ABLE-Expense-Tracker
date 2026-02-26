import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { AppLayout } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Expenses } from './pages/Expenses';

function NewExpensePlaceholder() {
  return <div>New Expense</div>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Login page — no AppShell wrapper */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes — wrapped in AppShell */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/new" element={<NewExpensePlaceholder />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
