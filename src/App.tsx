import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import VideoCall from './components/VideoCall';

// Home page component for joining a call
const HomePage = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleJoinCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/call/${roomId.trim()}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Sign Language Video Call
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Connect with sign language in real-time
        </p>
        
        <form onSubmit={handleJoinCall} className="space-y-6">
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-300 mb-2">
              Room ID
            </label>
            <input
              type="text"
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter a room ID"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              required
            />
            <p className="mt-1 text-sm text-gray-400">
              Share this ID with others to join the same room
            </p>
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Join Call
          </button>
          
          <div className="pt-4 border-t border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Quick Start</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Allow camera and microphone access when prompted</li>
              <li>• Use hand gestures to communicate in sign language</li>
              <li>• Gestures will be translated to text in real-time</li>
              <li>• Share the room ID with others to start a call</li>
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
};

// Call page component that handles the video call
const CallPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const handleLeaveCall = () => {
    navigate('/');
  };

  if (!roomId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 mb-4">No room ID provided</div>
          <button
            onClick={handleLeaveCall}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return <VideoCall roomId={roomId} onLeave={handleLeaveCall} />;
};

// Main App component with routing
const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/call/:roomId" element={<CallPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;