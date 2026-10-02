# syntax=docker/dockerfile:1

# Stage 1: Frontend — independent of .NET so BuildKit can run it in parallel
FROM node:26-bookworm-slim AS client-build
WORKDIR /client

COPY client/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY client/. ./
ENV NODE_ENV=production
RUN npm run build && find dist -name '*.map' -delete

# Stage 2: Backend — independent of the frontend
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS server-build
WORKDIR /src
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    NUGET_XMLDOC_MODE=skip

COPY server/*.csproj ./server/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore server/server.csproj

COPY server/. ./server/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish server/server.csproj -c Release -o /app/publish --no-restore \
        -p:UseAppHost=false \
        -p:DebugType=None \
        -p:DebugSymbols=false

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:5070 \
    ASPNETCORE_HTTP_PORTS=5070
EXPOSE 5070

COPY --from=server-build /app/publish .
COPY --from=server-build /src/server/data ./data
COPY --from=client-build /client/dist ./wwwroot

ENTRYPOINT ["dotnet", "server.dll"]
