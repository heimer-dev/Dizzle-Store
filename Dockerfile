FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Create directories for data and uploads
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

CMD ["node", "server.js"]
