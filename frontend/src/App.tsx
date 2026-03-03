import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import Pipeline from './pages/Pipeline.tsx';
import Leads from './pages/Leads.tsx';
import Contacts from './pages/Contacts.tsx';
import AuditLog from './pages/AuditLog.tsx';
import Admin from './pages/Admin.tsx';
import QuotePage from './pages/QuotePage.tsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/opportunities/:id/quote" element={<QuotePage />} />
      </Routes>
    </Layout>
  );
}
