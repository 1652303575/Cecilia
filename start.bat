@echo off
echo ========================================
echo 外贸商务邮件回复生成器
echo ========================================
echo.

REM Check if .env file exists
if not exist .env (
    echo [错误] 未找到 .env 文件！
    echo.
    echo 请按照以下步骤配置：
    echo 1. 复制 .env.example 为 .env
    echo 2. 编辑 .env 文件，填入您的 Claude API Key
    echo.
    echo 命令: copy .env.example .env
    echo.
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist venv (
    echo [提示] 未找到虚拟环境，正在创建...
    python -m venv venv
    if errorlevel 1 (
        echo [错误] 创建虚拟环境失败！请检查 Python 是否正确安装。
        pause
        exit /b 1
    )
    echo [成功] 虚拟环境创建完成
    echo.
)

REM Activate virtual environment
echo [提示] 激活虚拟环境...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo [错误] 激活虚拟环境失败！
    pause
    exit /b 1
)

REM Install dependencies
echo [提示] 检查依赖...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [错误] 安装依赖失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo [启动] 正在启动应用...
echo ========================================
echo.
echo 访问地址: http://127.0.0.1:8000
echo 按 Ctrl+C 停止服务器
echo.

REM Start the application
python main.py

pause
