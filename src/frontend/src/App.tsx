import { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import WelcomeScreen from './components/WelcomeScreen';
import ChatRoom from './components/ChatRoom';
import { normalizeRoomId } from './utils/roomId';

export default function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>('');

  const handleJoinRoom = (roomId: string, userNickname: string) => {
    // Normalize room ID to prevent whitespace issues
    const normalizedRoomId = normalizeRoomId(roomId);
    setCurrentRoom(normalizedRoomId);
    setNickname(userNickname);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setNickname('');
  };

  return (
    <div className="flex flex-col h-screen-safe bg-background text-foreground">
      <Header onLeaveRoom={currentRoom ? handleLeaveRoom : undefined} />
      
      <main className={`flex-1 ${currentRoom ? 'flex flex-col min-h-0' : ''}`}>
        {!currentRoom ? (
          <WelcomeScreen onJoinRoom={handleJoinRoom} />
        ) : (
          <ChatRoom roomId={currentRoom} nickname={nickname} />
        )}
      </main>
      
      {!currentRoom && <Footer />}
    </div>
  );
}
