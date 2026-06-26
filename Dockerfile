FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache \
    curl \
    jq \
    ca-certificates \
    openssl \
 && npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY . .

RUN chmod +x ./vault/vault-entrypoint.sh || true

EXPOSE 3000

CMD ["sh","-c","/app/vault/vault-entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('https').get({hostname:'localhost',port:3000,path:'/',rejectUnauthorized:false}, (r) => {if (r.statusCode !== 200) process.exit(1)})"