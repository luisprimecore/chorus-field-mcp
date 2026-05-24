FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY bin ./bin

RUN npm install --omit=dev

ENV CHORUS_PUBLIC_ORIGIN=https://luiscore.com
ENV NODE_ENV=production

# Glama introspection: stdio MCP (proxies live LuisCore APIs)
CMD ["node", "bin/mcp-stdio.js"]
