import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PendingTasks from './pages/PendingTasks';
import PendingRecurringTasks from './pages/PendingRecurringTasks';
import PcmPendingProcess from './pages/PcmPendingProcess';
import MasterTasks from './pages/MasterTasks';
import MasterRecurringTasks from './pages/MasterRecurringTasks';
import AssignTask from './pages/AssignTask';
import AdminPanel from './pages/AdminPanel';
import SuperAdminPanel from './pages/SuperAdminPanel';
import ProtectedRoute from './components/ProtectedRoute';
import Performance from './pages/Performance';
import Chat from './pages/Chat';
import SettingsPage from './pages/SettingsPage';
import RecycleBin from './pages/RecycleBin';
import HelpSupport from './pages/HelpSupport';
import TaskShift from './pages/TaskShift';
import ForApproval from './pages/ForApproval';
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Home from "./pages/Home";
import TermsAndConditions from "./pages/TermsAndConditions";
import { ToastContainer } from 'react-toastify';
import { usePcmIntegration } from './hooks/usePcmIntegration';

const PcmPendingRoute = () => {
  const { enabled, loading } = usePcmIntegration();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-b-2"
          style={{ borderColor: 'var(--color-primary)' }}
        />
      </div>
    );
  }

  if (!enabled) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ProtectedRoute requirePermission="pendingTasks">
      <PcmPendingProcess />
    </ProtectedRoute>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text)' }}>
            <Routes>

              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />

              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>

                {/* Permission-protected routes */}
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute requirePermission="dashboard">
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="performance"
                  element={
                    <ProtectedRoute requirePermission="performance">
                      <Performance />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="pending-tasks"
                  element={
                    <ProtectedRoute requirePermission="pendingTasks">
                      <PendingTasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="pending-recurring"
                  element={
                    <ProtectedRoute requirePermission="pendingRecurringTasks">
                      <PendingRecurringTasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="pcm-pending-process"
                  element={<PcmPendingRoute />}
                />

                <Route
                  path="master-tasks"
                  element={
                    <ProtectedRoute requirePermission="masterTasks">
                      <MasterTasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="master-recurring"
                  element={
                    <ProtectedRoute requirePermission="masterRecurringTasks">
                      <MasterRecurringTasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="assign-task"
                  element={
                    <ProtectedRoute requirePermission="assignTask">
                      <AssignTask />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="recycle-bin"
                  element={
                    <ProtectedRoute requirePermission="recyclebin">
                      <RecycleBin />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="chat"
                  element={
                    <ProtectedRoute requirePermission="chat">
                      <Chat />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="settings-page"
                  element={
                    <ProtectedRoute requireAdmin requirePermission="settingspage">
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="help-support"
                  element={
                    <ProtectedRoute requirePermission="helpsupport">
                      <HelpSupport />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="task-shift"
                  element={
                    <ProtectedRoute requireAdmin requirePermission="taskshift">
                      <TaskShift />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="for-approval"
                  element={
                    <ProtectedRoute requirePermission="forapproval">
                      <ForApproval />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute requireAdmin requirePermission="adminPanel">
                      <AdminPanel />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="superadmin"
                  element={
                    <ProtectedRoute requireSuperAdmin>
                      <SuperAdminPanel />
                    </ProtectedRoute>
                  }
                />

              </Route>
            </Routes>

            <ToastContainer position="top-right" autoClose={3000} />
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
