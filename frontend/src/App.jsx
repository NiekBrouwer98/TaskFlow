import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Today from './views/Today';
import TaskOverview from './views/TaskOverview';
import Planning from './views/Planning';
import Schedule from './views/Schedule';
import './App.css';

function App() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Backend not running'))))
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="app-error">
        <h1>TaskFlow</h1>
        <p>Could not connect to the backend.</p>
        <p className="hint">Start the backend from the <code>taskflow/backend</code> folder: <code>npm start</code></p>
        <p className="hint">Vault path will default to the parent of <code>taskflow</code> (your vault folder).</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-glass" />
          <div className="sidebar-content">
            <h1 className="sidebar-title">Tasks</h1>
            <nav className="sidebar-nav">
              <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} end>
                Today
              </NavLink>
              <NavLink to="/overview" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                Overview
              </NavLink>
              <NavLink to="/planning" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                Planning
              </NavLink>
              <NavLink to="/schedule" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                Schedule
              </NavLink>
            </nav>
            {config && (
              <div className="sidebar-footer">
                <span className="vault-path" title={config.vaultPath}>
                  Obsidian vault
                </span>
              </div>
            )}
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/overview" element={<TaskOverview />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/schedule" element={<Schedule />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

export default App;
