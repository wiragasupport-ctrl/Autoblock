FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data/auth

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
