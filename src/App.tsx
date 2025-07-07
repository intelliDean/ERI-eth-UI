import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import LandingPage from './pages/LandingPage';
import ManufacturerDashboard from './pages/ManufacturerDashboard';
import UserDashboard from './pages/UserDashboard';
import Navigation from './components/Navigation';
import { WalletProvider } from './contexts/WalletContext';

function App() {
  return (
    <WalletProvider>
      <Router>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
          <Navigation />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/manufacturer" element={<ManufacturerDashboard />} />
            <Route path="/user" element={<UserDashboard />} />
          </Routes>
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            className="mt-16"
          />
        </div>
      </Router>
    </WalletProvider>
  );
}

export default App;