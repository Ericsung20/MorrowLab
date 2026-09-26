import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from '../ui/pages/Dashboard';
import Planner from '../ui/pages/Planner';
import Session from '../ui/pages/Session';

export default function App() {
  return (
    <>
      <nav className="nav">
        <strong>MorrowLab</strong>
        <NavLink to="/">Planner</NavLink>
        <NavLink to="/session">Session</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Planner />} />
          <Route path="/session" element={<Session />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </>
  );
}
