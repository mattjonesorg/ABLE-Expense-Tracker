import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return <div>{name}</div>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder name="Home" />} />
        <Route path="/login" element={<Placeholder name="Login" />} />
        <Route path="/expenses" element={<Placeholder name="Expenses" />} />
        <Route path="/expenses/new" element={<Placeholder name="New Expense" />} />
        <Route path="/settings" element={<Placeholder name="Settings" />} />
      </Routes>
    </BrowserRouter>
  );
}
