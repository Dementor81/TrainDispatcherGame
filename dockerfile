# Stage 1: Build frontend (client)
FROM node:24 AS client-build
WORKDIR /client

COPY client/package*.json ./
RUN npm ci

COPY client/. ./
RUN npm run build   # Builds into /client/dist per webpack.config.js

# Stage 2: Build backend (server)
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS server-build
WORKDIR /src

COPY server/*.csproj ./server/
RUN dotnet restore server/server.csproj

COPY server/. ./server/
COPY --from=client-build /client/dist ./server/wwwroot

RUN dotnet publish server/server.csproj -c Release -o /app/publish

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:5070
ENV ASPNETCORE_HTTP_PORTS=5070
EXPOSE 5070
COPY --from=server-build /app/publish .
# Ensure required data directories are available at runtime
COPY --from=server-build /src/server/TrackLayouts ./TrackLayouts
COPY --from=server-build /src/server/data ./data
ENTRYPOINT ["dotnet", "server.dll"]