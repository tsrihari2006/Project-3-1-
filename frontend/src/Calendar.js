import React, { useState, useEffect } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { Modal, Button, Form, ListGroup, Badge } from "react-bootstrap";
import axios from "axios";
import { API_BASE_URL } from "./config";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function MyCalendar() {
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventSlot, setNewEventSlot] = useState({ start: null, end: null });

  // NEW: for daily events modal
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDayEvents, setSelectedDayEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  // Load tasks from backend
  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      const response = await axios.get(`${API_BASE_URL}/api/tasks`, {
        params: { token }
      });

      if (response.data.success) {
        const taskEvents = response.data.tasks.map(task => ({
          id: task.id,
          title: task.title,
          start: new Date(task.datetime),
          end: new Date(new Date(task.datetime).getTime() + 60 * 60 * 1000), // 1 hour duration
          type: 'task',
          priority: task.priority,
          category: task.category,
          notes: task.notes
        }));
        setTasks(taskEvents);
        setEvents(taskEvents);
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  // Open modal when slot is clicked
  const handleSelectSlot = ({ start, end }) => {
    setNewEventSlot({ start, end });
    setShowModal(true);
  };

  // Save new event
  const handleSaveEvent = () => {
    if (newEventTitle.trim() === "") return;
    const newEvent = {
      id: Date.now(),
      title: newEventTitle,
      start: newEventSlot.start,
      end: newEventSlot.end,
    };
    setEvents([...events, newEvent]);
    setNewEventTitle("");
    setShowModal(false);
  };

  // Delete event/task
  const handleDeleteEvent = async (id) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      // Check if it's a task (has type: 'task')
      const eventToDelete = events.find(e => e.id === id);
      if (eventToDelete && eventToDelete.type === 'task') {
        // Delete from backend
        await axios.delete(`${API_BASE_URL}/api/tasks/${id}`, {
          params: { token }
        });
        
        // Update local state
        const updatedEvents = events.filter((e) => e.id !== id);
        setEvents(updatedEvents);
        setTasks(tasks.filter((t) => t.id !== id));
        
        console.log(`Task ${id} deleted successfully`);
      } else {
        // Handle regular events (if any)
        const updatedEvents = events.filter((e) => e.id !== id);
        setEvents(updatedEvents);
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  // When a day is clicked, show all tasks for that day
  const handleDayClick = (slotInfo) => {
    const clickedDate = slotInfo.start;
    const dayEvents = events.filter((e) => isSameDay(e.start, clickedDate));
    if (dayEvents.length > 0) {
      setSelectedDay(clickedDate);
      setSelectedDayEvents(dayEvents);
      setShowDayModal(true);
    }
  };

  // Render custom event content (like +2 more)
  const eventPropGetter = (event) => {
    const isTask = event.type === 'task';
    let priorityColor = '#007bff'; // default blue
    
    if (isTask) {
      const colorMap = {
        'high': '#dc3545',     // red
        'medium': '#ffc107',   // yellow
        'low': '#28a745'       // green
      };
      priorityColor = colorMap[event.priority] || '#007bff';
    }
    
    return {
      style: {
        backgroundColor: isTask ? priorityColor : "#007bff",
        color: "white",
        borderRadius: "5px",
        border: "none",
        padding: "2px 4px",
        fontSize: "12px",
      },
    };
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">📅 My Professional Calendar</h3>
        <div>
          <Button 
            variant="outline-primary" 
            size="sm" 
            onClick={loadTasks}
            disabled={loading}
          >
            {loading ? "Loading..." : "🔄 Refresh"}
          </Button>
        </div>
      </div>

      <Calendar
        localizer={localizer}
        culture="en-US"
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: "70vh", borderRadius: "10px" }}
        views={["month", "week", "day", "agenda"]}
        selectable
        resizable
        draggableAccessor={() => true}
        date={currentDate}
        onNavigate={(date) => setCurrentDate(date)}
        onSelectSlot={handleDayClick} // clicking day shows all events
        eventPropGetter={eventPropGetter}
      />

      {/* Add Event Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Event</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="eventTitle">
              <Form.Label>Event Title</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter event title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveEvent}>
            Save Event
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Day Details Modal */}
      <Modal
        show={showDayModal}
        onHide={() => setShowDayModal(false)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Tasks on{" "}
            {selectedDay ? format(selectedDay, "EEEE, MMMM d yyyy") : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedDayEvents.length > 0 ? (
            <ListGroup>
              {selectedDayEvents.map((e) => (
                <ListGroup.Item
                  key={e.id}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div style={{ flex: 1 }}>
                    <h6 className="mb-1">
                      {e.title}
                      {e.type === 'task' && e.priority && (
                        <Badge 
                          bg={
                            e.priority === 'high' ? 'danger' : 
                            e.priority === 'medium' ? 'warning' : 'success'
                          }
                          className="ms-2"
                        >
                          {e.priority}
                        </Badge>
                      )}
                    </h6>
                    <small className="text-muted">
                      {format(e.start, "hh:mm a")} - {format(e.end, "hh:mm a")}
                      {e.type === 'task' && e.category && (
                        <span className="ms-2">
                          📂 {e.category}
                        </span>
                      )}
                    </small>
                    {e.type === 'task' && e.notes && (
                      <div className="mt-1">
                        <small className="text-muted">{e.notes}</small>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteEvent(e.id)}
                  >
                    Delete
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          ) : (
            <p className="text-muted">No tasks for this day.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDayModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default MyCalendar;
