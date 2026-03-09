import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, User, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useCheckRoomExists,
  useCreateRoom,
  useJoinRoom,
} from "../hooks/useQueries";
import { getChatErrorMessage } from "../utils/chatErrorMessages";
import { normalizeRoomId } from "../utils/roomId";

interface WelcomeScreenProps {
  onJoinRoom: (roomId: string, nickname: string) => void;
}

export default function WelcomeScreen({ onJoinRoom }: WelcomeScreenProps) {
  const [joinCode, setJoinCode] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [joinNickname, setJoinNickname] = useState("");

  const createRoomMutation = useCreateRoom();
  const joinRoomMutation = useJoinRoom();
  const { refetch: checkRoomExists } = useCheckRoomExists(
    normalizeRoomId(joinCode),
  );

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalized = normalizeRoomId(createCode);
    if (!normalized) {
      toast.error("Please enter a room code");
      return;
    }

    const trimmedNickname = createNickname.trim();
    if (!trimmedNickname) {
      toast.error("Please enter a nickname");
      return;
    }

    if (trimmedNickname.length > 20) {
      toast.error("Nickname cannot exceed 20 characters");
      return;
    }

    try {
      console.log(
        "[WelcomeScreen] Creating room with code:",
        normalized,
        "nickname:",
        trimmedNickname,
      );
      const roomId = await createRoomMutation.mutateAsync({
        joinCode: normalized,
        nickname: trimmedNickname,
      });
      console.log("[WelcomeScreen] Room created successfully:", roomId);
      toast.success("Room created successfully!");
      onJoinRoom(roomId, trimmedNickname);
    } catch (error: any) {
      console.error("[WelcomeScreen] Room creation error:", error);
      const errorMessage = getChatErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalized = normalizeRoomId(joinCode);
    if (!normalized) {
      toast.error("Please enter a room code");
      return;
    }

    const trimmedNickname = joinNickname.trim();
    if (!trimmedNickname) {
      toast.error("Please enter a nickname");
      return;
    }

    if (trimmedNickname.length > 20) {
      toast.error("Nickname cannot exceed 20 characters");
      return;
    }

    try {
      console.log("[WelcomeScreen] Checking if room exists:", normalized);
      const { data: exists } = await checkRoomExists();
      console.log("[WelcomeScreen] Room exists check result:", exists);

      if (exists) {
        // Join the room with the nickname
        await joinRoomMutation.mutateAsync({
          joinCode: normalized,
          nickname: trimmedNickname,
        });
        toast.success("Joining room...");
        onJoinRoom(normalized, trimmedNickname);
      } else {
        toast.error("Room not found. Please check the code and try again.");
      }
    } catch (error: any) {
      console.error("[WelcomeScreen] Room join error:", error);
      const errorMessage = getChatErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <Shield className="w-20 h-20 text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">SecureChat</h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Private, secure messaging rooms. Enter a nickname to create or join
            a room.
          </p>
        </div>

        {/* Room Actions */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Create Room
              </CardTitle>
              <CardDescription>
                Start a new secure chat room with a custom code
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-nickname">Your Nickname</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="create-nickname"
                      type="text"
                      placeholder="Enter your nickname"
                      value={createNickname}
                      onChange={(e) => setCreateNickname(e.target.value)}
                      maxLength={20}
                      disabled={createRoomMutation.isPending}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose a display name (max 20 characters)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-code">Room Code</Label>
                  <Input
                    id="create-code"
                    type="text"
                    placeholder="Enter a unique room code"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    maxLength={30}
                    disabled={createRoomMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose a memorable code (max 30 characters)
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    !createCode.trim() ||
                    !createNickname.trim() ||
                    createRoomMutation.isPending
                  }
                >
                  {createRoomMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Room"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Join Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Join Room
              </CardTitle>
              <CardDescription>
                Enter a room code to join an existing chat
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="join-nickname">Your Nickname</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="join-nickname"
                      type="text"
                      placeholder="Enter your nickname"
                      value={joinNickname}
                      onChange={(e) => setJoinNickname(e.target.value)}
                      maxLength={20}
                      disabled={joinRoomMutation.isPending}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose a display name (max 20 characters)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-code">Room Code</Label>
                  <Input
                    id="join-code"
                    type="text"
                    placeholder="Enter room code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    maxLength={30}
                    disabled={joinRoomMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ask the room creator for the code
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    !joinCode.trim() ||
                    !joinNickname.trim() ||
                    joinRoomMutation.isPending
                  }
                >
                  {joinRoomMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Room"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="grid sm:grid-cols-3 gap-4 pt-8">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold">Secure</h3>
            <p className="text-sm text-muted-foreground">
              End-to-end encrypted messaging
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold">Private Rooms</h3>
            <p className="text-sm text-muted-foreground">
              Create custom rooms with unique codes
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <User className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold">Anonymous</h3>
            <p className="text-sm text-muted-foreground">
              No account required, just a nickname
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
