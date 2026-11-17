FROM mcr.microsoft.com/dotnet/sdk:11.0.100@sha256:65f3c7c6a25a239ab3e6719f2896147e7b68242ff2d8818dd70498bde6ef8bea AS build
WORKDIR /source
ENV DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false DOTNET_PROCESSOR_COUNT=4
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ zlib1g-dev && rm -rf /var/lib/apt/lists/*
COPY global.json Directory.Build.props Directory.Build.targets Directory.Packages.props Persona.CSharp.slnx ./
COPY services/persona/csharp ./services/persona/csharp
ARG PERSONA_APP=Persona.Server
FROM build AS native-build
ARG PERSONA_APP=Persona.Server
RUN case "$PERSONA_APP" in Persona.Server) ;; *) exit 2 ;; esac \
    && dotnet publish "services/persona/csharp/apps/$PERSONA_APP/$PERSONA_APP.csproj" \
       -c Release -r linux-x64 -p:PublishAot=true -p:CppCompilerAndLinker=gcc -p:DebugType=None -o /native \
    && mv "/native/$PERSONA_APP" /native/persona
FROM mcr.microsoft.com/dotnet/runtime-deps:11.0.0@sha256:6d3e208d8f5ba599ad9e80c615b5c1a2e355fd903f585cb07342dde29441675a AS nativeaot
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* /usr/bin/pebble
WORKDIR /app
COPY --from=native-build /native ./
USER 0
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["/app/persona", "health"]
ENTRYPOINT ["/app/persona"]
