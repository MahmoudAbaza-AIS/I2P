# syntax=docker/dockerfile:1
# Rolling deploy: build image → start new container → /health/ready → repoint reverse proxy (PR §9).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore Platform.I2P.sln
RUN dotnet publish src/Platform.I2P.Api/Platform.I2P.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
COPY --from=build /app/publish .
# Orchestrator/reverse-proxy must probe /health/live and /health/ready before cutover (PR §9).
ENTRYPOINT ["dotnet", "Platform.I2P.Api.dll"]
