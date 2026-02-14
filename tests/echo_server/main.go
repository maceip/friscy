package main

import (
	"net/http"
	"os"
	"runtime"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	runtime.GOMAXPROCS(1)

	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	e.GET("/", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"message": "Echo server running in friscy!",
			"runtime": "riscv64-wasm",
		})
	})

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"status": "ok",
		})
	})

	e.Any("/echo", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"method":  c.Request().Method,
			"path":    c.Request().URL.String(),
			"host":    c.Request().Host,
			"headers": c.Request().Header,
		})
	})

	e.Logger.Fatal(e.Start(":" + port))
}
