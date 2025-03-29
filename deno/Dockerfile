FROM denoland/deno:latest

EXPOSE 8000

WORKDIR /app

COPY . .

CMD ["deno", "serve", "--allow-net", "--allow-read", "--allow-env", "--allow-ffi", "--allow-write", "main.ts"]