# Use the official lightweight Python image.
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app

# Copy .env if you want to bake in defaults (optional—better via Cloud Run env-vars)
# COPY .env .

# Expose the port Cloud Run expects
ENV PORT 8080
EXPOSE 8080

# Launch Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
