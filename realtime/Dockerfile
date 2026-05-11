FROM golang:1.25-alpine AS build

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/infinilink-realtime ./main.go

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates \
    && addgroup -S app \
    && adduser -S -G app app
COPY --from=build /out/infinilink-realtime /app/infinilink-realtime
USER app
EXPOSE 8090
CMD ["./infinilink-realtime"]
