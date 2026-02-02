import { Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onLeaveRoom?: () => void;
}

export default function Header({ onLeaveRoom }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SecureChat</h1>
            <p className="text-xs text-muted-foreground">Anonymous & Private</p>
          </div>
        </div>
        {onLeaveRoom && (
          <Button onClick={onLeaveRoom} variant="ghost" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Leave Room
          </Button>
        )}
      </div>
    </header>
  );
}
