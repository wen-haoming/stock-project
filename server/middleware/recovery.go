package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

// Recovery 错误恢复中间件
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v\n%s", err, debug.Stack())
				c.JSON(http.StatusInternalServerError, gin.H{
					"code":  -1,
					"error": "Internal Server Error",
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}
