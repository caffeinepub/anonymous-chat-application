import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import Header from './components/Header';
import Footer from './components/Footer';
import WelcomeScreen from './components/WelcomeScreen';
import ChatRoom from './components/ChatRoom';

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>('');

  const handleJoinRoom = (roomId: string, userNickname: string) => {
    setCurrentRoom(roomId);
    setNickname(userNickname);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setNickname('');
  };

  const handleNicknameChange = (newNickname: string) => {
    setNickname(newNickname);
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className={`flex flex-col bg-background ${currentRoom ? 'h-screen-safe overflow-hidden' : 'min-h-screen'}`}>
        <Header onLeaveRoom={currentRoom ? handleLeaveRoom : undefined} />
        <main className={`flex-1 ${currentRoom ? 'flex flex-col min-h-0' : ''}`}>
          {!currentRoom ? (
            <WelcomeScreen onJoinRoom={handleJoinRoom} />
          ) : (
            <ChatRoom 
              roomId={currentRoom} 
              nickname={nickname}
              onLeave={handleLeaveRoom}
              onNicknameChange={handleNicknameChange}
            />
          )}
        </main>
        {!currentRoom && <Footer />}
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;
