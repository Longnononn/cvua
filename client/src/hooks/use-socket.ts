import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";

interface SocketUser {
  id: number;
  username: string;
}

export function useSocket(roomId: string | null | undefined, user: SocketUser | null | undefined) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const { toast } = useToast();
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    if (!user || !roomId) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let cancelled = false;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const envWsUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined;
    const wsUrl = envWsUrl || `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        ws?.send(JSON.stringify({ type: 'auth', userId: user.id }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          if (data.type === 'opponent_joined') {
              toast({
                  title: "Đối thủ đã kết nối",
                  description: `${data.username} đã tham gia ván đấu!`,
              });
          }
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setSocket(null);
        if (cancelled) return;
        reconnectTimer = window.setTimeout(() => {
          setReconnectAttempt(prev => prev + 1);
        }, 1000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: "Lỗi kết nối",
          description: "Mất kết nối với máy chủ ván đấu.",
          variant: "destructive",
        });
      };

      setSocket(ws);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomId, user, toast, reconnectAttempt]);

  const send = (message: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not open. Message not sent.");
    }
  };

  return { isConnected, lastMessage, send };
}
