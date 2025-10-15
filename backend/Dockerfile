# Use official Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy and install dependencies first for caching
COPY requirements.txt .

# Upgrade pip and install dependencies
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure environment variables are available inside the container
# If you are building from backend directory, this will copy backend/.env → /app/.env
COPY .env /app/.env

# Expose FastAPI port (use 5000 to match frontend proxy and app config)
EXPOSE 5000

# Start the application on port 5000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
