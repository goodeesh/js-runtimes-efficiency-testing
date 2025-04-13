FROM denoland/deno:latest

EXPOSE 8000

WORKDIR /app

COPY . .

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]