FROM node:14-alpine
WORKDIR /app
COPY package*.json /app/
RUN npm install -g nodemon
RUN npm install 
COPY . /app/
CMD ["nodemon"]
EXPOSE 5000