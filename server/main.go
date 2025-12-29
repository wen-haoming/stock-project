package main

import (
	"log"
	"os"
	"os/signal"
	"server/config"
	"server/repositories"
	"server/routes"
	"server/scheduler"
	"syscall"
)

func main() {
	// 加载配置
	cfg := config.Load()
	log.Printf("服务器启动，端口: %s", cfg.Server.Port)

	// 连接数据库
	if err := repositories.Connect(); err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	defer repositories.Disconnect()

	// 初始化索引
	if err := repositories.InitIndexes(); err != nil {
		log.Printf("初始化股票索引失败: %v", err)
	}
	if err := repositories.InitKlineIndexes(); err != nil {
		log.Printf("初始化K线索引失败: %v", err)
	}
	if err := repositories.InitRangeCacheIndexes(); err != nil {
		log.Printf("初始化区间缓存索引失败: %v", err)
	}

	// 启动调度器
	sched := scheduler.NewScheduler()
	sched.Start()
	defer sched.Stop()

	// 设置路由
	r := routes.SetupRouter()

	// 优雅关闭
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("正在关闭服务器...")
		sched.Stop()
		repositories.Disconnect()
		os.Exit(0)
	}()

	// 启动服务
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}
