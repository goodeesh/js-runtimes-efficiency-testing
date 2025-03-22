# Use the official Node.js image from the Docker Hub
FROM node:22

# Create and change to the app directory
WORKDIR /app

# Copy configuration files first
COPY package*.json tsconfig.json ./

# Install dependencies including TypeScript
RUN npm install
RUN npm install -g typescript

# Copy the local code to the container image
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Run the web service on container startup
CMD ["node", "dist/index.js"]