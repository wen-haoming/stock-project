FROM golang:1.23-alpine AS builder

WORKDIR /app

# 安装依赖
RUN apk add --no-cache git

# 复制 go.mod 和 go.sum
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 构建
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# 运行阶段
FROM alpine:3.19

WORKDIR /app

# 安装时区数据
RUN apk add --no-cache tzdata ca-certificates

# 设置时区
ENV TZ=Asia/Shanghai

# 复制二进制文件
COPY --from=builder /app/main .

EXPOSE 8080

CMD ["./main"]
