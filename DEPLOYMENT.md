# Train Dispatcher Game - Deployment Guide

## Prerequisites

- Docker with buildx support
- Docker Hub account (or access to `marcus360` repository)
- Git

## Project Architecture

The application consists of:
- **Frontend (Client)**: TypeScript/Node.js application built with webpack
- **Backend (Server)**: .NET 9.0 ASP.NET Core application with SignalR
- **Port**: 5070 (HTTP)

## Local Production Build (VSCode/Cursor)

The project includes VSCode/Cursor tasks for building production versions locally.

### Building the Client (Frontend)

**Option 1: Using Terminal**
```bash
cd client
npm run build
```

This builds the client into `client/dist/` directory.

**Option 2: Using VSCode/Cursor Tasks**
1. Press `Cmd/Ctrl + Shift + P` to open Command Palette
2. Type `Tasks: Run Task`
3. Select `start` (for development) or run `npm run build` manually

### Building the Server (Backend)

**Option 1: Using VSCode/Cursor Tasks** (Recommended)
1. Press `Cmd/Ctrl + Shift + P` to open Command Palette
2. Type `Tasks: Run Task`
3. Select `publish`

This publishes the server to `server/bin/Release/net9.0/publish/` (or similar path).

**Option 2: Using Terminal**
```bash
cd server
dotnet publish server.csproj -c Release -o ./bin/Release/net9.0/publish
```

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
- `start`: Start webpack dev server (client)
- `start-all`: Start both server and client concurrently
- `start-dotnet`: Start .NET server in watch mode
- `start-webpack`: Start webpack dev server

## Building the Docker Image

The project uses a multi-stage Docker build:
1. Stage 1: Builds the frontend (Node.js 24)
2. Stage 2: Builds the backend (.NET SDK 9.0) and copies frontend dist
3. Stage 3: Creates runtime image (.NET ASP.NET 9.0)

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

### Alternative Build Commands

**Build without pushing:**
```bash
docker buildx build --platform linux/amd64 -t marcus360/train_dispatcher_game:test .
```

**Build for multiple platforms:**
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t marcus360/train_dispatcher_game:test --push .
```

**Build for production (different tag):**
```bash
docker buildx build --platform linux/amd64 -t marcus360/train_dispatcher_game:latest --push .
```

## Running the Container

### Local Development/Testing

```bash
docker run -d -p 5070:5070 --name train_dispatcher marcus360/train_dispatcher_game:test
```

**Options:**
- `-d`: Run in detached mode
- `-p 5070:5070`: Map host port to container port
- `--name train_dispatcher`: Container name for easy reference

### With Custom Port Mapping

```bash
docker run -d -p 8080:5070 --name train_dispatcher marcus360/train_dispatcher_game:test
```

Access the application at `http://localhost:8080`

### With Environment Variables

```bash
docker run -d \
  -p 5070:5070 \
  -e ASPNETCORE_ENVIRONMENT=Production \
  --name train_dispatcher \
  marcus360/train_dispatcher_game:test
```

## Container Management

**View logs:**
```bash
docker logs train_dispatcher
```

**Follow logs in real-time:**
```bash
docker logs -f train_dispatcher
```

**Stop container:**
```bash
docker stop train_dispatcher
```

**Start container:**
```bash
docker start train_dispatcher
```

**Remove container:**
```bash
docker rm train_dispatcher
```

**Remove container (force):**
```bash
docker rm -f train_dispatcher
```

## Accessing the Application

Once deployed, the application is accessible at:
- **Main Application**: `http://<host>:5070/main.html`
- **Admin Panel**: `http://<host>:5070/admin.html`
- **Scenarios**: `http://<host>:5070/szenarios.html`

## Deployment Checklist

- [ ] Ensure all code changes are committed
- [ ] Build and test locally if needed
- [ ] Build Docker image with appropriate tag
- [ ] Verify image is pushed to Docker Hub
- [ ] Pull and run image on target server
- [ ] Verify application is accessible
- [ ] Check logs for any errors
- [ ] Test core functionality (WebSocket/SignalR connections)

## Cloud Deployment Examples

### Docker Compose (Optional)

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  train_dispatcher:
    image: marcus360/train_dispatcher_game:test
    ports:
      - "5070:5070"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
    restart: unless-stopped
```

Deploy with:
```bash
docker-compose up -d
```

### Cloud Platforms

**AWS ECS / Azure Container Instances / Google Cloud Run:**
- Use the image: `marcus360/train_dispatcher_game:test`
- Expose port: `5070`
- Ensure WebSocket support is enabled (for SignalR)

## Troubleshooting

**Build fails:**
- Ensure you're in the project root directory
- Check Docker daemon is running
- Verify network connectivity for package downloads

**Container won't start:**
- Check logs: `docker logs train_dispatcher`
- Verify port 5070 is not already in use
- Ensure sufficient system resources

**WebSocket/SignalR connection issues:**
- Verify reverse proxy (if any) supports WebSocket upgrades
- Check CORS settings in server configuration
- Ensure firewall allows connections on port 5070

## Security Considerations

- Change default ports in production
- Use HTTPS with reverse proxy (nginx, Traefik, etc.)
- Set proper CORS policies
- Use specific version tags instead of `:test` or `:latest` in production
- Regularly update base images for security patches

## Version Management

Recommended tagging strategy:
- `test`: Development/testing builds
- `staging`: Pre-production builds
- `latest` or `v1.0.0`: Production releases with semantic versioning

