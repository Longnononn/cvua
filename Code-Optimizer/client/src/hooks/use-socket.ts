import { useEffect, useRef, useState } from 'react';
import { useToast } from "@/hooks/use-toast";

type GameEvent = 
  | { type: 'move'; from: string; to: string; promotion?: string }
  | { type: 'chat'; text: string; sender: string }
  | { type: 'join'; roomId: string; username: string }
  | { type: 'opponent_joined'; username: string }
  | { type: 'start_game'; color: 'w' | 'b' }
  | { type: 'game_over'; result: string };

export function useSocket(roomId: string | null, username: string | undefined) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<GameEvent | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!roomId || !username) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?roomId=${roomId}&username=${username}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to game server');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        
        if (data.type === 'opponent_joined') {
            toast({
                title: "Opponent Connected",
                description: `${data.username} has joined the game!`,
            });
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from game server');
      setIsConnected(false);
      setSocket(null);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: "Lost connection to the game server.",
        variant: "destructive",
      });
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [roomId, username, toast]);

  const send = (message: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not open. Message not sent.");
    }
  };

  return { isConnected, lastMessage, send };
}
