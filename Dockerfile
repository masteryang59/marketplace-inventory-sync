FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY mocks ./mocks
RUN mkdir -p data && chown node:node data

USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
ENV ROLLBACK_CHANGES=true
ENV TRANSCODE_VIDEO=true