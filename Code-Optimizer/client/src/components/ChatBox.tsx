import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  sender: string;
  text: string;
  isMe: boolean;
}

interface ChatBoxProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export function ChatBox({ messages, onSendMessage, disabled }: ChatBoxProps) {
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     if (scrollRef.current) {
        const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText("");
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-[300px] lg:h-full">
      <div className="px-4 py-3 bg-white/5 border-b border-white/5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">Live Chat</h3>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-slate-600 text-xs mt-4 italic">
              No messages yet. Say hello!
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
              {!msg.isMe && (
                <span className="text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">{msg.sender}</span>
              )}
              <div 
                className={`
                  px-3 py-2 rounded-xl text-sm max-w-[85%] shadow-sm
                  ${msg.isMe 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-sm'}
                `}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-3 bg-slate-900/50 border-t border-white/5 flex gap-2">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="bg-slate-800 border-none focus-visible:ring-indigo-500/50"
          disabled={disabled}
        />
        <Button 
          type="submit" 
          size="icon" 
          disabled={disabled || !inputText.trim()}
          className="bg-indigo-600 hover:bg-indigo-500"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
