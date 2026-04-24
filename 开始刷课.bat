@echo off
chcp 65001 >nul
title 山东高速学习平台 - 自动刷课工具
color 0A

echo.
echo =========================================
echo     山东高速学习平台 - 自动刷课工具
echo =========================================
echo.

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js 已安装

:: 检查配置文件
if not exist "config.json" (
    echo [错误] 未找到 config.json 配置文件
    pause
    exit /b 1
)

echo [✓] 配置文件已找到
echo.
echo 正在启动刷课程序...
echo.
echo =========================================
echo.

:: 运行脚本
node study.js

:: 如果脚本异常退出，暂停显示错误
if errorlevel 1 (
    echo.
    echo [错误] 程序运行失败
    pause
)
