import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { PlanningCycleProvider } from './context/PlanningCycleContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import People from './pages/People';
import Allocations from './pages/Allocations';
import Requests from './pages/Requests';
import ChangeRequests from './pages/ChangeRequests';
import Recruitment from './pages/Recruitment';
import Admin from './pages/Admin';
import Import from './pages/Import';
import Headcount from './pages/Headcount';
import Summary from './pages/Summary';

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#FFFFFF', color: '#111827', border: '1px solid #E0E3E8', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
        }}
      />
      <BrowserRouter>
        <PlanningCycleProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard"       element={<Dashboard />} />
              <Route path="/projects"        element={<Projects />} />
              <Route path="/people"          element={<People />} />
              <Route path="/allocations"     element={<Allocations />} />
              <Route path="/requests"        element={<Requests />} />
              <Route path="/change-requests" element={<ChangeRequests />} />
              <Route path="/recruitment"     element={<Recruitment />} />
              <Route path="/headcount"       element={<Headcount />} />
              <Route path="/summary"         element={<Summary />} />
              <Route path="/admin"           element={<Admin />} />
              <Route path="/import"          element={<Import />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </PlanningCycleProvider>
      </BrowserRouter>
    </>
  );
}
