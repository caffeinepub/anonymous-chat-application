import { useState } from 'react';
import { Plus, LogIn, Shield, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useCreateRoom } from '../hooks/useQueries';
import { toast } from 'sonner';

interface WelcomeScreenProps {
  onJoinRoom: (roomId: string, nickname: string) => void;
}

export default function WelcomeScreen({ onJoinRoom }: WelcomeScreenProps) {
  const [joinCode, setJoinCode] = useState('');
  const [newRoomCode, setNewRoomCode] = useState('');
  const [createNickname, setCreateNickname] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const createRoom = useCreateRoom();

  const handleCreateRoom = async () => {
    if (!newRoomCode.trim()) {
      toast.error('Please enter a room code');
      return;
    }

    if (!createNickname.trim()) {
      toast.error('Please enter a nickname');
      return;
    }

    try {
      await createRoom.mutateAsync(newRoomCode.trim());
      toast.success('Room created successfully!');
      onJoinRoom(newRoomCode.trim(), createNickname.trim());
    } catch (error) {
      toast.error('Failed to create room. Code may already exist.');
    }
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) {
      toast.error('Please enter a join code');
      return;
    }

    if (!joinNickname.trim()) {
      toast.error('Please enter a nickname');
      return;
    }

    onJoinRoom(joinCode.trim(), joinNickname.trim());
  };

  return (
    <div className="container py-8 px-4">
      <div className="w-full max-w-5xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="/assets/generated/secure-chat-logo-transparent.dim_200x200.png"
              alt="SecureChat Logo"
              className="h-32 w-32 object-contain"
            />
          </div>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Anonymous Real-Time Chat
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Create secure chat rooms and share join codes with friends. Messages automatically delete after 24 hours.
          </p>
        </div>

        {/* Features */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <Shield className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Anonymous</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No registration required. Chat completely anonymously.
              </p>
            </CardContent>
          </Card>
          <Card className="border-accent/20">
            <CardHeader className="pb-3">
              <Clock className="h-8 w-8 text-accent mb-2" />
              <CardTitle className="text-lg">Auto-Delete</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Messages automatically delete after 24 hours for privacy.
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <Users className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Multi-Device</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Join from multiple devices and networks seamlessly.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action Cards */}
        <div className="grid gap-6 sm:grid-cols-2 pb-8">
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New Room
              </CardTitle>
              <CardDescription>
                Start a new chat room and share the code with friends
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-nickname">Your Nickname</Label>
                <Input
                  id="create-nickname"
                  placeholder="Enter your display name"
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-room-code">Room Code</Label>
                <Input
                  id="new-room-code"
                  placeholder="Enter a unique room code"
                  value={newRoomCode}
                  onChange={(e) => setNewRoomCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
              </div>
              <Button
                onClick={handleCreateRoom}
                disabled={createRoom.isPending}
                className="w-full"
                size="lg"
              >
                {createRoom.isPending ? 'Creating...' : 'Create Room'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Join Existing Room
              </CardTitle>
              <CardDescription>
                Enter a join code shared by a friend
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="join-nickname">Your Nickname</Label>
                <Input
                  id="join-nickname"
                  placeholder="Enter your display name"
                  value={joinNickname}
                  onChange={(e) => setJoinNickname(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="join-code">Join Code</Label>
                <Input
                  id="join-code"
                  placeholder="Enter room code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                variant="secondary"
                className="w-full"
                size="lg"
              >
                Join Room
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
