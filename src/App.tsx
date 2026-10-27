import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireRole, { HomeRedirect } from './components/RequireRole';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Houses from './pages/admin/Houses';
import Payments from './pages/admin/Payments';
import Notices from './pages/admin/Notices';
import Reports from './pages/admin/Reports';
import Users from './pages/admin/Users';
import Settings from './pages/admin/Settings';
import MyAccount from './pages/resident/MyAccount';
import Visits from './pages/resident/Visits';
import Gate from './pages/guard/Gate';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/admin" element={<RequireRole role="admin"><Layout /></RequireRole>}>
          <Route index element={<Dashboard />} />
          <Route path="casas" element={<Houses />} />
          <Route path="pagos" element={<Payments />} />
          <Route path="avisos" element={<Notices />} />
          <Route path="reportes" element={<Reports />} />
          <Route path="usuarios" element={<Users />} />
          <Route path="configuracion" element={<Settings />} />
        </Route>

        <Route path="/residente" element={<RequireRole role="residente"><Layout /></RequireRole>}>
          <Route index element={<MyAccount />} />
          <Route path="visitas" element={<Visits />} />
        </Route>

        <Route path="/vigilante" element={<RequireRole role="vigilante"><Layout /></RequireRole>}>
          <Route index element={<Gate />} />
        </Route>

        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </HashRouter>
  );
}
