import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Loader2 } from 'lucide-react';
import { useCreateRoom, useRoomExists } from '../hooks/useQueries';
import { toast } from 'sonner';
import { sanitizeChatError } from '../utils/chatErrorMessages';
import { logSafeOperationFailure } from '../utils/chatOperationErrors';
import { normalizeRoomId } from '../utils/roomId';

interface WelcomeScreenProps {
  onJoinRoom: (roomId: string, nickname: string) => void;
}

export default function WelcomeScreen({ onJoinRoom }: WelcomeScreenProps) {
  const [createRoomCode, setCreateRoomCode] = useState('');
  const [createNickname, setCreateNickname] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');

  const createRoomMutation = useCreateRoom();

  // Optimistic room existence check - doesn't block on failure
  const normalizedJoinCode = normalizeRoomId(joinRoomCode);
  const { data: roomExists, isLoading: isCheckingRoom } = useRoomExists(
    normalizedJoinCode || null
  );

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const normalizedCode = normalizeRoomId(createRoomCode);
    const trimmedNickname = createNickname.trim();
    
    if (!normalizedCode) {
      toast.error('Please enter a room code');
      return;
    }
    if (!trimmedNickname) {
      toast.error('Please enter your nickname');
      return;
    }

    try {
      await createRoomMutation.mutateAsync(normalizedCode);
      onJoinRoom(normalizedCode, trimmedNickname);
    } catch (error) {
      const sanitized = sanitizeChatError(error);
      
      // Log safe context without nickname
      logSafeOperationFailure('createRoom', { roomCode: normalizedCode }, error);
      
      // If room already exists, try joining instead
      if (sanitized.includes('already exists')) {
        toast.info('Room already exists. Joining instead...');
        onJoinRoom(normalizedCode, trimmedNickname);
      } else {
        toast.error(sanitized);
      }
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const normalizedCode = normalizeRoomId(joinRoomCode);
    const trimmedNickname = joinNickname.trim();
    
    if (!normalizedCode) {
      toast.error('Please enter a room code');
      return;
    }
    if (!trimmedNickname) {
      toast.error('Please enter your nickname');
      return;
    }

    // Optimistic join - if pre-check failed, we'll try anyway
    if (roomExists === false && !isCheckingRoom) {
      toast.error('Room does not exist. Please check the room code or create a new room.');
      return;
    }

    onJoinRoom(normalizedCode, trimmedNickname);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="w-full max-w-md space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
              <img 
                src="/assets/generated/secure-chat-logo-transparent.dim_200x200.png" 
                alt="SecureChat Logo" 
                className="relative h-24 w-24 mx-auto drop-shadow-lg"
              />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              SecureChat
            </h1>
            <p className="text-muted-foreground mt-2">
              Private, ephemeral messaging rooms
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span>Messages auto-delete after 24 hours</span>
          </div>
        </div>

        {/* Tabs for Create/Join */}
        <Card className="border-2 shadow-xl">
          <Tabs defaultValue="create" className="w-full">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">Create Room</TabsTrigger>
                <TabsTrigger value="join">Join Room</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {/* Create Room Tab */}
              <TabsContent value="create" className="mt-0">
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <CardDescription className="text-center mb-4">
                    Create a new private chat room
                  </CardDescription>
                  
                  <div className="space-y-2">
                    <Label htmlFor="create-room-code">Room Code</Label>
                    <Input
                      id="create-room-code"
                      placeholder="Enter a unique room code"
                      value={createRoomCode}
                      onChange={(e) => setCreateRoomCode(e.target.value)}
                      maxLength={30}
                      required
                      disabled={createRoomMutation.isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Share this code with others to invite them
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-nickname">Your Nickname</Label>
                    <Input
                      id="create-nickname"
                      placeholder="Enter your nickname"
                      value={createNickname}
                      onChange={(e) => setCreateNickname(e.target.value)}
                      maxLength={20}
                      required
                      disabled={createRoomMutation.isPending}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createRoomMutation.isPending}
                  >
                    {createRoomMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Room...
                      </>
                    ) : (
                      'Create & Join Room'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Join Room Tab */}
              <TabsContent value="join" className="mt-0">
                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <CardDescription className="text-center mb-4">
                    Join an existing chat room
                  </CardDescription>
                  
                  <div className="space-y-2">
                    <Label htmlFor="join-room-code">Room Code</Label>
                    <Input
                      id="join-room-code"
                      placeholder="Enter the room code"
                      value={joinRoomCode}
                      onChange={(e) => setJoinRoomCode(e.target.value)}
                      maxLength={30}
                      required
                      disabled={isCheckingRoom}
                    />
                    {isCheckingRoom && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Checking room...
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="join-nickname">Your Nickname</Label>
                    <Input
                      id="join-nickname"
                      placeholder="Enter your nickname"
                      value={joinNickname}
                      onChange={(e) => setJoinNickname(e.target.value)}
                      maxLength={20}
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isCheckingRoom}
                  >
                    {isCheckingRoom ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      'Join Room'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div className="space-y-1">
            <div className="text-2xl">🔒</div>
            <p className="text-muted-foreground">Private</p>
          </div>
          <div className="space-y-1">
            <div className="text-2xl">⏱️</div>
            <p className="text-muted-foreground">Ephemeral</p>
          </div>
          <div className="space-y-1">
            <div className="text-2xl">🚀</div>
            <p className="text-muted-foreground">Fast</p>
          </div>
        </div>
      </div>
    </div>
  );
}
