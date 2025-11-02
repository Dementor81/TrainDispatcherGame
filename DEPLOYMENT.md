# Train Dispatcher Game - Deployment Guide

## Project Architecture

The application consists of:
- **Frontend (Client)**: TypeScript/Node.js application built with webpack
- **Backend (Server)**: .NET 9.0 ASP.NET Core application with SignalR
- **Ports**: 5070 (HTTP). For HTTPS, terminate TLS at a reverse proxy (recommended) or enable Kestrel HTTPS.

## Local Production Build (VSCode/Cursor)

The project includes VSCode/Cursor tasks for building production versions locally.

### Building the Client (Frontend)

**Using VSCode/Cursor Tasks** (Recommended)
1. Press `Cmd/Ctrl + Shift + P` to open Command Palette
2. Type `Tasks: Run Task`
3. Select `build-client`

This builds the client with production optimizations into `client/dist/` directory.

### Building the Server (Backend)

Using VSCode/Cursor Tasks** (Recommended)
1. Press `Cmd/Ctrl + Shift + P` to open Command Palette
2. Type `Tasks: Run Task`
3. Select `publish`

This publishes the server to `server/bin/Release/net9.0/publish/` (or similar path).

### Running Development Environment

**Start Both Server and Client (Hot Reload):**
1. Press `Cmd/Ctrl + Shift + P`
2. Type `Tasks: Run Task`
3. Select `start-all`

This runs both the .NET server (watch mode) and webpack dev server concurrently.

**Available Tasks:**
- `build`: Build .NET server (Debug)
- `publish`: Publish .NET server for production (Release)
- `watch`: Run .NET server in watch mode
- `build-client`: Build client with production optimizations
- `start`: Start webpack dev server (client)
- `start-all`: Start both server and client concurrently
- `start-dotnet`: Start .NET server in watch mode
- `start-webpack`: Start webpack dev server

### Build Command

To build and push the Docker image for linux/amd64 platform:

```bash
docker buildx build --platform linux/amd64 -t marcus360/train_dispatcher_game:test --push .
```

**Notes:**
- `--platform linux/amd64`: Targets x86_64 architecture (common for cloud deployments)
- `-t marcus360/train_dispatcher_game:test`: Tags the image
- `--push`: Automatically pushes to Docker Hub after successful build
- `.`: Build context is the project root directory


sudo docker login
sudo docker container run --name train_dispatch_game -d -p5070:5070 marcus360/train_dispatcher_game:test


Once deployed, the application is accessible at:
- **Main Application**: `http://<host>:5070/main.html`
- **Admin Panel**: `http://<host>:5070/admin.html`
- **Scenarios**: `http://<host>:5070/szenarios.html`

## HTTPS/SSL Setup

The app supports HTTPS when run behind a reverse proxy (nginx, Traefik, Caddy, Azure App Gateway, etc.) or directly via Kestrel.

### Recommended: TLS termination at reverse proxy

1. Proxy `https://your-domain` to container `http://container-ip:5070`.
2. Preserve and forward headers `X-Forwarded-Proto` and `X-Forwarded-For`.
3. Example nginx snippet:

nginx
server {
    listen 443 ssl http2;
    server_name your-domain;
    ssl_certificate /etc/letsencrypt/live/your-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5070;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}


Server notes:
- `Program.cs` enables `ForwardedHeaders` and HTTPS redirection + HSTS in non-Development.
- When behind a proxy, clients should load pages at `https://…`; fetch calls use relative `/api` and SignalR uses relative `/gamehub` so both work under HTTPS.

### Optional: Direct Kestrel HTTPS (self-host TLS)

If you need the container to serve HTTPS directly:

1. Provide a certificate and key:
   - Use a `pfx` file and mount into the container, e.g. `/app/certs/site.pfx`.
2. Set environment variables when running the container:

```bash
docker run -d \
  -e ASPNETCORE_URLS="http://+:5070;https://+:5071" \
  -e ASPNETCORE_Kestrel__Certificates__Default__Path="/app/certs/site.pfx" \
  -e ASPNETCORE_Kestrel__Certificates__Default__Password="<pfx-password>" \
  -p 5070:5070 -p 5071:5071 \
  -v /host/path/certs:/app/certs:ro \
  --name train_dispatch_game marcus360/train_dispatcher_game:test
```

Client URLs in production:
- **Main Application**: `https://<host>/main.html`
- **Admin Panel**: `https://<host>/admin.html`
- **Scenarios**: `https://<host>/szenarios.html`