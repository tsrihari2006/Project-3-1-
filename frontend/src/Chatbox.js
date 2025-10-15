import React, { useState, useRef, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import * as chrono from "chrono-node";
import SpeechToText from "./components/SpeechToText";
import { API_BASE_URL } from "./config";

function Chatbox({ chat }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const fileInputRef = useRef(null);
  const [currentChatId, setCurrentChatId] = useState(null);

  useEffect(() => {
    if (chat) {
      setMessages(chat.messages || []);
      setCurrentChatId(chat.id || null);
    }
  }, [chat]);

  // -------- SAVE TO HISTORY --------
  const saveToHistory = (msgs) => {
    // Chat history is now automatically saved to PostgreSQL via the backend API
    // No need to manage localStorage anymore
    if (msgs.length === 1 && !currentChatId) {
      const chatId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
      setCurrentChatId(chatId);
    }
  };

  // -------- NEW CHAT --------
  const startNewChat = () => {
    const newId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
    setCurrentChatId(newId);
    setMessages([]);
    console.log("New chat started with ID:", newId);
  };

  // -------- ADD CALENDAR EVENT --------
  const addEventFromChat = (text) => {
    const results = chrono.parse(text);
    if (results.length > 0) {
      const date = results[0].start.date();
      const newEvent = {
        id: Date.now(),
        title: text,
        start: date,
        end: new Date(date.getTime() + 60 * 60 * 1000),
      };
      // Calendar events are now automatically created as tasks in the backend
      // when users create tasks through chat, so no need for separate handling here
      console.log("Calendar event detected (handled by backend):", newEvent);
    }
  };

  // -------- SEND TEXT MESSAGE --------
  const sendMessage = async () => {
    if (!input.trim()) return;

    // Generate chat_id if this is the first message
    let chatId = currentChatId;
    if (!chatId) {
      chatId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
      setCurrentChatId(chatId);
    }

    const newMessage = { type: "text", sender: "user", content: input };
    const updated = [...messages, newMessage];
    setMessages(updated);
    setInput("");
    saveToHistory(updated);
    addEventFromChat(input);

    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        console.error("No authentication token found");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_message: input, token, chat_id: chatId }),
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const reply = data.reply || data.response || "⚠ No response from AI";

      setMessages((prev) => {
        const withAi = [...prev, { type: "text", sender: "ai", content: reply }];
        saveToHistory(withAi);
        return withAi;
      });
    } catch (err) {
      console.error("Backend error:", err);
      const errorMessage = err.message.includes('ECONNRESET') || err.message.includes('proxy') 
        ? "⚠ Connection lost. Please try again." 
        : "⚠ Failed to reach backend";
      
      setMessages((prev) => [
        ...prev,
        { type: "text", sender: "ai", content: errorMessage },
      ]);
    }
  };

  // -------- HANDLE FILE UPLOAD (Images, PDFs, Docs) --------
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Generate chat_id if this is the first message
    let chatId = currentChatId;
    if (!chatId) {
      chatId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
      setCurrentChatId(chatId);
    }

    const fileURL = URL.createObjectURL(file);
    const newMessage = { type: "image", sender: "user", content: fileURL };
    const updated = [...messages, newMessage];
    setMessages(updated);
    saveToHistory(updated);

    // Create FormData to send file + message
    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "prompt",
      JSON.stringify({
        sender: "user",
        text: "Please analyze this document or image and tell me what you see.",
      })
    );

    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        console.error("No authentication token found");
        return;
      }
      
      formData.append("token", token);
      formData.append("chat_id", chatId);
      
      const res = await fetch(`${API_BASE_URL}/chat-with-upload/`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const reply = data.response || "⚠ No analysis received";

      setMessages((prev) => {
        const withAi = [...prev, { type: "text", sender: "ai", content: reply }];
        saveToHistory(withAi);
        return withAi;
      });
    } catch (err) {
      console.error("Upload error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "text", sender: "ai", content: "⚠ File upload failed" },
      ]);
    }
  };

  return (
    <div className="d-flex flex-column vh-100 bg-light">
      {/* Chat Messages */}
      <div className="d-flex justify-content-between align-items-center px-4 py-2 border-bottom bg-white">
        <div className="fw-semibold">{currentChatId ? "Chat" : "New Chat"}</div>
        <button className="btn btn-sm btn-outline-primary" onClick={startNewChat}>New Chat</button>
      </div>
      <div className="flex-grow-1 p-4 overflow-auto" style={{ background: "#f5f5f5" }}>
        {messages.length === 0 ? (
          <div className="d-flex justify-content-center align-items-center h-100">
            <h4 className="text-muted">👋 Welcome! Ask your first query...</h4>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`d-flex mb-3 ${
                msg.sender === "user" ? "justify-content-end" : "justify-content-start"
              }`}
            >
              {msg.type === "text" && (
                <div
                  className={`p-2 px-3 rounded-3 ${
                    msg.sender === "user" ? "bg-primary text-white" : "bg-white shadow-sm"
                  }`}
                  style={{ maxWidth: "70%" }}
                >
                  {msg.content}
                </div>
              )}

              {msg.type === "audio" && <audio controls src={msg.content}></audio>}

              {msg.type === "image" && (
                <img
                  src={msg.content}
                  alt="sent"
                  className="rounded shadow-sm"
                  style={{ maxWidth: "200px" }}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="input-area p-3 bg-white border-top">
        <div className="d-flex align-items-center">
          {/* Text Input */}
          <input
            type="text"
            className="form-control me-2 flex-grow-1"
            style={{ maxWidth: "60%" }}
            placeholder="Type or speak your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          {/* Speech Input */}
          <div className="me-2">
            <SpeechToText onChange={setInput} />
          </div>

          {/* File Upload (Moved Here) */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileUpload}
          />
          <button
            className="btn btn-outline-secondary me-2"
            onClick={() => fileInputRef.current.click()}
            title="Upload file or image"
          >
            📁
          </button>

          {/* Send Button */}
          <button className="btn btn-primary" onClick={sendMessage}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chatbox;
