FROM bufbuild/buf:1.55.1 AS buf
WORKDIR /src
COPY buf.yaml buf.gen.yaml ./
COPY proto ./proto
RUN buf generate

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY --from=buf /src/gen ./gen
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/parley ./cmd/parley

FROM gcr.io/distroless/static-debian12:latest
COPY --from=build /out/parley /parley
EXPOSE 50051 9090
ENTRYPOINT ["/parley"]