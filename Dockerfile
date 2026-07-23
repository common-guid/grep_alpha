# Stage 1: Build Frontend React SPA
FROM node:22-alpine AS frontend-builder
WORKDIR /app/FlipCharts

COPY FlipCharts/package*.json ./
RUN npm ci

COPY FlipCharts/ ./
RUN npm run build

# Stage 2: Production Python FastAPI App
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY grep_alpha/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn pydantic

# Copy backend & grep_alpha source
COPY backend ./backend
COPY grep_alpha ./grep_alpha

# Copy built frontend dist from Stage 1
COPY --from=frontend-builder /app/FlipCharts/dist ./FlipCharts/dist

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
