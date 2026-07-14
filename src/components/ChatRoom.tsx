import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, ShieldAlert } from 'lucide-react';

interface ChatMessage {
  sender: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

interface ChatRoomProps {
  chatLog: ChatMessage[];
  playerName: string;
  onSendMessage: (message: string) => void;
}

export default function ChatRoom({ chatLog, playerName, onSendMessage }: ChatRoomProps) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatLog]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText || !inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3">
        <MessageSquare size={16} className="text-red-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Community Chat</span>
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
          Online
        </span>
      </div>

      {/* Chat Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[220px] max-h-[300px]"
      >
        {chatLog.map((chat, idx) => {
          if (chat.isSystem) {
            return (
              <div 
                key={idx}
                className="rounded-lg bg-slate-950/40 p-2.5 border border-slate-800/50 text-[10px] text-slate-400 leading-normal flex gap-1.5"
              >
                <ShieldAlert size={12} className="text-red-500/80 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-300">System Announcement: </span>
                  {chat.message}
                </div>
              </div>
            );
          }

          const isMe = chat.sender === playerName;

          return (
            <div 
              key={idx} 
              className={`flex flex-col text-xs max-w-[85%] ${
                isMe ? 'ml-auto items-end' : 'items-start'
              }`}
            >
              {/* Sender & Timestamp */}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5 px-1">
                <span className={`font-semibold ${isMe ? 'text-red-400/85' : 'text-slate-400'}`}>
                  {chat.sender}
                </span>
                <span>•</span>
                <span>{formatTime(chat.timestamp)}</span>
              </div>

              {/* Speech Bubble */}
              <div className={`rounded-xl px-3 py-2 leading-relaxed ${
                isMe 
                  ? 'bg-red-500 text-slate-950 font-medium rounded-tr-none shadow-sm shadow-red-500/10' 
                  : 'bg-slate-950/50 text-slate-300 rounded-tl-none border border-slate-800/60'
              }`}>
                {chat.message}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input controls */}
      <form onSubmit={handleSend} className="p-2 bg-slate-950/80 border-t border-slate-800 flex gap-1.5">
        <input
          type="text"
          placeholder="Type your message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={120}
          className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-700 font-sans"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-slate-950 hover:bg-red-400 transition active:scale-95 disabled:opacity-30 disabled:hover:bg-red-500"
        >
          <Send size={12} />
        </button>
      </form>
    </div>
  );
}
