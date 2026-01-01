import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function GlobalInviteListener() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { lastMessage } = useSocket("global", user ?? null);

  useEffect(() => {
    if (lastMessage?.type === 'new_invite') {
      const invite = lastMessage.invite;
      toast({
        title: "Lời mời thách đấu mới",
        description: `${invite.fromUsername} muốn thách đấu với bạn!`,
        action: (
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={() => setLocation(`/game/online/${invite.roomId}`)}
            >
              Chấp nhận
            </Button>
          </div>
        ),
        duration: 10000,
      });
    }
  }, [lastMessage, toast, setLocation]);

  return null;
}
