import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Profile from './pages/Profile';
import ListingDetail from './pages/ListingDetail';
import MyActivity from './pages/MyActivity';
import Transfers from './pages/Transfers';
import Trips from './pages/Trips';

export default function App() {
  return (
    <BrowserRouter basename="/atollisle/">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/bookings" element={<MyActivity />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/trips" element={<Trips />} />
      </Routes>
    </BrowserRouter>
  );
}