FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/infinilink-backend ./cmd/api

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=build /out/infinilink-backend /app/infinilink-backend
COPY static ./static
RUN mkdir -p ./storage/uploads
EXPOSE 8080
CMD ["./infinilink-backend"]

