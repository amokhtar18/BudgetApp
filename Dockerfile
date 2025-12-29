# Budget Application Dockerfile
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Set work directory to backend
WORKDIR /app/backend

# Expose port
EXPOSE 8000

# Run with Gunicorn
CMD ["gunicorn", "--config", "gunicorn_config.py", "wsgi:app"]
