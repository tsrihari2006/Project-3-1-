import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaComments, FaTasks, FaCalendarAlt, FaHistory, FaCog, FaSignOutAlt } from "react-icons/fa";
import "../../styles/Sidebar.css";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const links = [
    { path: "/chat", name: "Chat", icon: <FaComments /> },
    { path: "/tasks", name: "Tasks", icon: <FaTasks /> },
    { path: "/calendar", name: "Calendar", icon: <FaCalendarAlt /> },
    { path: "/history", name: "History", icon: <FaHistory /> },
    { path: "/settings", name: "Settings", icon: <FaCog /> },
  ];

  const handleSignOut = () => {
    // clear local storage or auth data if needed
    localStorage.removeItem("authToken"); 
    navigate("/login");
  };

  return (
    <div className="sidebar d-flex flex-column vh-100 p-3">
      <h4>MyAI Assistant</h4>
      <ul className="nav flex-column mt-4 flex-grow-1">
        {links.map((link) => (
          <li key={link.path} className="nav-item mb-2">
            <Link
              to={link.path}
              className={`nav-link d-flex align-items-center ${
                location.pathname === link.path ? "active" : ""
              }`}
            >
              <span className="me-2">{link.icon}</span>
              {link.name}
            </Link>
          </li>
        ))}
      </ul>

      {/* Sign Out button pinned at bottom */}
      <button
        onClick={handleSignOut}
        className="btn btn-outline-danger d-flex align-items-center mt-auto"
      >
        <FaSignOutAlt className="me-2" />
        Sign Out
      </button>
    </div>
  );
}
