FROM node:22-alpine

WORKDIR /app

# Copia dependências primeiro
COPY package*.json ./
COPY prisma ./prisma/

# Instala dependências
RUN npm install

# Copia o restante do código
COPY . .

# Gera o client do prisma
RUN npx prisma generate

# Compila o typescript (se necessário) ou podemos rodar usando dev
RUN npm run build

# Expõe a porta
EXPOSE 3333

# Comando para iniciar
CMD ["npm", "run", "start"]
