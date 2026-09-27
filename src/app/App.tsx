import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ArrowUpRight, BookOpen, CalendarDays, Leaf } from "lucide-react";
import Dashboard from "../pages/Dashboard";
import Session from "../pages/Session";
import Summary from "../pages/Summary";
import Tomorrow from "../pages/Tomorrow";
import { isDemoAdapter } from "./dependencies";
import "../styles/app.css";
export default function App() {
  return (
    <>
      <header className="site-header">
        <NavLink className="brand" to="/">
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          <span>
            MorrowLab<small>Learn how you learn.</small>
          </span>
        </NavLink>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <BookOpen size={17} /> Today
          </NavLink>
          <NavLink to="/tomorrow">
            <CalendarDays size={17} /> Tomorrow
          </NavLink>
        </nav>
        <span className="workspace-label">
          Your personal study space <ArrowUpRight size={15} />
        </span>
      </header>
      <main className="workspace">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/session" element={<Session />} />
          <Route path="/summary/:sessionId" element={<Summary />} />
          <Route path="/tomorrow" element={<Tomorrow />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer>
        <span>MorrowLab · A little more intentional, every day.</span>
        {isDemoAdapter && (
          <span>Demo mode · Illustrative insights & scores</span>
        )}
      </footer>
    </>
  );
}
