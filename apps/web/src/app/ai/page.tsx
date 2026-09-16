"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AiAssistant() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<any[]>([]);

  const chatMutation = useMutation({
    mutationFn: (msg: string) => api.chat(msg),
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.data.content }]);
    },
    onError: (error: Error) => {
      setMessages(prev => [...prev, { role: "error", content: error.message }]);
    },
  });

  const handleSend = () => {
    if (!message.trim() || chatMutation.isPending) return;

    setMessages(prev => [...prev, { role: "user", content: message }]);
    chatMutation.mutate(message);
    setMessage("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      <h1 className="text-2xl font-bold mb-4">AI Assistant</h1>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 mb-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            Ask me anything about your professional network
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-100 ml-auto max-w-[80%]"
                    : msg.role === "error"
                    ? "bg-red-100 text-red-800 mr-auto max-w-[80%]"
                    : "bg-gray-100 mr-auto max-w-[80%]"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="bg-gray-100 mr-auto max-w-[80%] p-3 rounded-lg">
                Thinking...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask about your network..."
          className="flex-1 border rounded-lg px-4 py-2"
          disabled={chatMutation.isPending}
        />
        <button
          onClick={handleSend}
          disabled={chatMutation.isPending}
          className="bg-blue-500 text-white px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {chatMutation.isPending ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}
