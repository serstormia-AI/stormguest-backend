# Base image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./

RUN npm install --production

# Bundle app source
COPY . .

# Expose the port
EXPOSE 3001

# Run the application
CMD [ "node", "server.js" ]
