# Use the official Node.js image from the Docker Hub
FROM node:22

# Create and change to the app directory
WORKDIR /app

# Install build dependencies for SQLite
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy configuration files first
COPY package*.json tsconfig.json ./

# Install dependencies including TypeScript
RUN npm install

# Copy the local code to the container image
COPY ./src ./src

# Delete node_modules and reinstall for the container environment
RUN rm -rf node_modules && npm install && npm rebuild better-sqlite3

# Build TypeScript code
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Run the web service on container startup
CMD ["node", "dist/index.js"]