FROM node:20-alpine

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Expose the Vite dev server port
EXPOSE 3000

# Start the dev server
CMD ["npm", "run", "dev"]
