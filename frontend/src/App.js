import React, { useState } from "react";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const newMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");

    try {
      const response = await axios.post(`${API_URL}/chat`, { message: input });
      const botMessage = { sender: "bot", text: response.data.reply };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errMsg = { sender: "bot", text: "Error connecting to the server." };
      setMessages((prev) => [...prev, errMsg]);
    }
  };

  return (
    <div className="app" style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Personal AI Assistant</h1>
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: "10px",
          padding: "1rem",
          height: "400px",
          overflowY: "auto",
          marginBottom: "1rem",
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              textAlign: msg.sender === "user" ? "right" : "left",
              marginBottom: "10px",
            }}
          >
            <strong>{msg.sender === "user" ? "You" : "Bot"}:</strong>{" "}
            {msg.text}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          placeholder="Type your message..."
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: "10px 20px",
            background: "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
