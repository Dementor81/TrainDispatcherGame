Train Dispatch Game


This is a small web game that simulates some rail stations. Every player controls the switches and signals of one of them to eventuelly pilot all trains through the rail network. 

The application consists of:
- **Frontend (Client)**: TypeScript/Node.js application built with webpack
- **Backend (Server)**: .NET 9.0 ASP.NET Core application with SignalR

## Development environment

### Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js](https://nodejs.org/) (includes npm)

On macOS, install both with Homebrew. The `node` formula is the current Node release:

```bash
brew install node dotnet@9
```

Homebrew links both commands onto your `PATH`. The `dotnet` command also points itself at the SDK, so no extra shell setup is required.

The client image in the Dockerfile is built with Node 26 (`node:26-bookworm-slim`). A newer local Node is fine for development. If its major version differs from that image, update the `FROM node:…` line so the container build uses the same Node.

Check the installed versions:

```bash
dotnet --version
node --version
```

### Client packages

The server has no extra packages. ASP.NET Core and SignalR come with the .NET 9 SDK.

The client depends on the packages in `client/package.json`, including webpack, TypeScript, PixiJS, SignalR, and Bootstrap. They live in `client/node_modules`, which is not committed. If that folder is already there, nothing else needs installing. On a fresh clone:

```bash
npm ci --prefix client
```

### Run

Start the server first. It listens on `http://localhost:5070` (`ASPNETCORE_ENVIRONMENT=Development`):

```bash
dotnet watch run --project server/server.csproj
```

In a second terminal, start the webpack dev server. It listens on `http://localhost:9000` and proxies `/api` and `/gamehub` to the server:

```bash
npm start --prefix client
```

Open `http://localhost:9000/main.html`. Other pages are `gameMaster.html`, `scenarioEditor.html`, `networkEditor.html`, and `timeDistance.html`.

To point the client at a server that is not on `http://localhost:5070`, set `API_PROXY_TARGET` before `npm start`.

### Cursor or VS Code

The C# extension is needed to debug the server with the `.NET Core Launch (web)` configuration.

To start both processes together: Command Palette (`Cmd/Ctrl + Shift + P`) → **Tasks: Run Task** → `start-all`. That runs the server in watch mode, then starts webpack after a short delay. Individual tasks are `start-dotnet` and `start-webpack`.
