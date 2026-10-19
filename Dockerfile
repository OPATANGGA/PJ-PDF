FROM python:3.12-slim

WORKDIR /app

# Install Thai fonts and basic system libraries for OpenCV/Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-core \
    fonts-tlwg-waree \
    fonts-tlwg-loma \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
