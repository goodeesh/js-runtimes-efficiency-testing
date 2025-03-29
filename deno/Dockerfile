FROM denoland/deno:2.2.4

EXPOSE 8000

WORKDIR /app

COPY . .

CMD ["deno", "serve", "--allow-net", "--allow-read", "--allow-env", "--allow-ffi", "--allow-write", "main.ts"]