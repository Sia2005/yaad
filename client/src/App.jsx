import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PatientPicker from './pages/PatientPicker';
import Dashboard from './pages/caregiver/Dashboard';
import Mirror from './pages/mirror/Mirror';

const Protected = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* the patient picker is the home screen after auth */}
          <Route
            path="/"
            element={
              <Protected>
                <PatientPicker />
              </Protected>
            }
          />

          {/* a patient's dashboard, scoped by id */}
          <Route
            path="/patient/:patientId"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />

          <Route
            path="/mirror/:patientId"
            element={
              <Protected>
                <Mirror />
              </Protected>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
