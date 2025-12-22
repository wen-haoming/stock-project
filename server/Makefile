# 🚀 港股数据服务 Makefile
# 用于快速构建、测试和部署项目

.PHONY: help build run dev watch clean kill

PORT = 8080
BIN = ./tmp/main

# 默认目标
help: ## 显示帮助信息
	@echo "📋 可用的命令："
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "🚀 常用命令："
	@echo "  make dev       - 开发模式：杀端口 + 构建 + 运行"
	@echo "  make watch     - 热重载：监听文件变化自动重启"
	@echo "  make kill      - 杀掉占用端口的进程"

# 杀掉占用端口的进程
kill: ## 释放端口
	@echo "🔪 释放端口 $(PORT)..."
	@lsof -ti :$(PORT) | xargs kill -9 2>/dev/null || true

# 构建
build: ## 构建项目
	@echo "🔨 正在构建..."
	@mkdir -p tmp
	@go build -o $(BIN) .
	@echo "✅ 构建完成"

# 运行
run: ## 启动服务
	@echo "🚀 启动服务 (端口 $(PORT))..."
	@$(BIN)

# 开发模式
dev: kill build ## 开发模式：杀端口 + 构建 + 运行
	@echo "🚀 启动服务..."
	@$(BIN)

# 热重载
watch: ## 热重载模式（监听文件变化自动重启）
	@echo "👀 热重载模式启动..."
	@echo "按 Ctrl+C 退出"
	@while true; do \
		find . -name "*.go" -newer $(BIN) 2>/dev/null | grep -q . && make dev; \
		sleep 1; \
	done

# 清理
clean: kill ## 清理临时文件
	@echo "🧹 清理临时文件..."
	@rm -rf tmp
	@echo "✅ 清理完成"
