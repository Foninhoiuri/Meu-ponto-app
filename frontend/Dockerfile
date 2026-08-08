# Estágio de build
FROM node:22-alpine as build

WORKDIR /app

# Copia configurações de dependências
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todo o projeto
COPY . .

# Faz o build estático
RUN npm run build

# Estágio de produção (Nginx)
FROM nginx:alpine

# Copia os arquivos buildados
COPY --from=build /app/dist /usr/share/nginx/html

# Copia arquivo de configuração do Nginx para suportar React Router
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
