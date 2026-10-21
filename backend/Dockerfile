FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENV=production

# Module execution layout: /opt/backend is the `backend` package
WORKDIR /opt

# Copy requirements first (for layer caching)
COPY requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy application code into the backend package
COPY . ./backend/

# Drop root
RUN useradd --create-home appuser && chown -R appuser /opt
USER appuser

# Render injects $PORT; __main__.py reads it (defaults to 8000 locally)
EXPOSE 8000

CMD ["python", "-m", "backend"]
