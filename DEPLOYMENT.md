# Train Dispatcher Game - Deployment Guide

## Project Architecture

The application consists of:
- **Frontend (Client)**: TypeScript/Node.js application built with webpack
- **Backend (Server)**: .NET 9.0 ASP.NET Core application with SignalR
- **Port**: 5070 (HTTP)

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

Once deployed, the application is accessible at:
- **Main Application**: `http://<host>:5070/main.html`
- **Admin Panel**: `http://<host>:5070/admin.html`
- **Scenarios**: `http://<host>:5070/szenarios.html`