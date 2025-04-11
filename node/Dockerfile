# Use the official Node.js image from the Docker Hub
FROM node:22

# Create and change to the app directory
WORKDIR /app

# Install curl and wait-for-it script
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Add wait-for-it script
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /usr/local/bin/wait-for-it
RUN chmod +x /usr/local/bin/wait-for-it

# Copy configuration files first
COPY package*.json tsconfig.json ./

# Install dependencies including TypeScript
RUN npm install

# Copy the local code to the container image
COPY ./src ./src

# Copy the resources folder to the container image
COPY ./resources ./resources

# Build TypeScript code (this generates the dist directory)
RUN npm run build

# Delete node_modules and reinstall for the container environment
RUN rm -rf node_modules && npm install

# Expose the port the app runs on
EXPOSE 3000

# Run wait-for-it script to wait for PostgreSQL, then start the app
CMD ["sh", "-c", "wait-for-it postgres:5432 -t 60 -- node dist/index.js"]