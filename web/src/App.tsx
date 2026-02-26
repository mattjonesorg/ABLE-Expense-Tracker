import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { Login } from './pages/Login';

function Placeholder({ name }: { name: string }) {
  return <div>{name}</div>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Placeholder name="Home" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/expenses" element={<Placeholder name="Expenses" />} />
          <Route
            path="/expenses/new"
            element={<Placeholder name="New Expense" />}
          />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
