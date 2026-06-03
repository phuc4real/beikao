import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { RoomPage } from '@/pages/RoomPage';

export function App() {
  return (
    <HashRouter>
      <div className="min-h-full bg-felt-dark text-white">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
