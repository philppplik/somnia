# Build stage
FROM rust:1-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

# Runtime stage: distroless, non-root, no shell
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /app/target/release/somnia-relay /usr/local/bin/somnia-relay
USER nonroot
EXPOSE 8787
# Inside a container the relay must listen on all interfaces to be reachable;
# publish to 127.0.0.1 on the host when the TLS proxy runs there.
ENV SOMNIA_RELAY_BIND=0.0.0.0:8787
ENTRYPOINT ["/usr/local/bin/somnia-relay"]
