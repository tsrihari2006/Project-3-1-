import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { API_BASE_URL } from "./config";

export default function Tasks() {
  const [activeTab, setActiveTab] = useState("all");
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const response = await fetch(`${API_BASE_URL}/api/tasks?token=${encodeURIComponent(token || "")}`);
        const data = await response.json();

        if (data.success && Array.isArray(data.tasks)) {
          const formattedTasks = data.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.notified ? "completed" : "pending",
            datetime: task.datetime,
          }));
          setTasks(formattedTasks);
        } else {
          console.error("Invalid tasks data:", data);
        }
      } catch (err) {
        console.error("Error fetching tasks:", err);
      }
    };

    fetchTasks();
  }, []);

  const filteredTasks =
    activeTab === "all" ? tasks : tasks.filter((t) => t.status === activeTab);

  const handleAddTask = () => {
    const title = prompt("Enter task title:");
    if (!title) return;

    const datetime = prompt(
      "Enter date and time (YYYY-MM-DD HH:MM):",
      new Date().toISOString().slice(0, 16).replace("T", " ")
    );
    if (!datetime) return;

    const newTask = {
      id: Date.now(),
      title,
      status: "pending",
      datetime: new Date(datetime).toISOString(),
    };

    setTasks([...tasks, newTask]);
  };

  const handleRemoveTask = async (id) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      // Update local state
      setTasks(tasks.filter((task) => task.id !== id));
      console.log(`Task ${id} deleted successfully`);
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4>Tasks & Reminders</h4>
          <small>
            {tasks.filter((t) => t.status === "pending").length} pending,{" "}
            {tasks.filter((t) => t.status === "completed").length} completed
          </small>
        </div>
        <button className="btn btn-primary" onClick={handleAddTask}>
          + Add Task
        </button>
      </div>

      <ul className="nav nav-tabs">
        {["all", "pending", "completed"].map((tab) => (
          <li key={tab} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          </li>
        ))}
      </ul>

      <div className="p-4">
        {filteredTasks.length > 0 ? (
          <ul className="list-group">
            {filteredTasks.map((task) => (
              <li
                key={task.id}
                className="list-group-item d-flex justify-content-between align-items-center flex-column flex-md-row"
              >
                <div style={{ flex: 1 }}>
                  <strong>{task.title}</strong>
                  <br />
                  <small>
                    {new Date(task.datetime).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                </div>

                <div className="d-flex gap-2">
                  <span
                    className={`badge ${
                      task.status === "completed"
                        ? "bg-success"
                        : "bg-warning text-dark"
                    }`}
                  >
                    {task.status}
                  </span>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleRemoveTask(task.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center mt-4">
            <p>
              <strong>No tasks yet</strong>
            </p>
            <p>Create your first task to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
