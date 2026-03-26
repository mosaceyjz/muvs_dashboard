# MUVS Dashboard 服务器配置傻瓜教程

这份教程默认你要把系统装到一台 Windows 服务器或者一台长期不关机的 Windows 电脑上。

装好以后，你会得到 3 个访问地址：

1. 主看板: `http://服务器IP:3036/`
2. 现场大屏: `http://服务器IP:3036/board`
3. 导航页: `http://服务器IP:3036/nav`

## 一、准备工作

你需要准备：

1. 一台 Windows 服务器或常开电脑
2. 这台机器能访问数据库服务器 `PRCCJ-MSGCR01`
3. 这台机器和现场大屏电脑在同一个局域网，或者网络互通
4. 安装好 Node.js LTS

## 二、把项目放到服务器上

建议放到这个目录：

```powershell
C:\Apps\muvs-dashboard
```

做法：

1. 在服务器上新建文件夹 `C:\Apps\muvs-dashboard`
2. 把你现在电脑里的整个 `muvs-dashboard` 文件夹内容全部复制进去

复制完成后，服务器目录里应该能看到这些文件：

1. `package.json`
2. `server.js`
3. `public` 文件夹
4. `scripts` 文件夹
5. `.env.server.example`

## 三、配置环境变量文件

### 第 1 步：复制模板

在服务器上的项目目录里，把：

```powershell
.env.server.example
```

复制一份并改名为：

```powershell
.env
```

### 第 2 步：确认内容

`.env` 里应该至少有这些内容：

```env
DB_SERVER=PRCCJ-MSGCR01
DB_DATABASE=MUVS
DB_USER=sa
DB_PASSWORD=123456?a
DB_PORT=1433
APP_HOST=0.0.0.0
APP_PORT=3036
DASHBOARD_CACHE_TTL_MS=60000
```

说明：

1. `APP_HOST=0.0.0.0` 代表允许局域网其他电脑访问
2. `APP_PORT=3036` 代表网页端口是 3036
3. `DASHBOARD_CACHE_TTL_MS=60000` 代表缓存 60 秒，减少数据库压力

## 四、安装依赖

用管理员身份打开 PowerShell，然后执行：

```powershell
cd C:\Apps\muvs-dashboard
npm install
```

如果看到安装完成，没有报错，就继续下一步。

### 如果这里报错：`npm is not recognized`

这说明服务器没有正确安装 Node.js，或者安装了但环境变量还没生效。

按下面顺序处理：

#### 方法 1：先检查是不是已经装了 Node.js

在 PowerShell 执行：

```powershell
node -v
npm -v
```

如果这两个命令都不认，继续看“方法 2”。

如果 `node -v` 有结果，但 `npm -v` 没结果，继续看“方法 3”。

#### 方法 2：重新安装 Node.js

最简单做法：

1. 到 Node.js 官网下载安装 LTS 版本
2. 安装时保持默认选项
3. 安装完成后，关闭当前 PowerShell 窗口
4. 重新打开一个新的 PowerShell
5. 再执行：

```powershell
node -v
npm -v
```

如果能看到版本号，再回到项目目录执行：

```powershell
cd C:\Apps\muvs-dashboard
npm install
```

#### 方法 3：Node 已装，但 npm 不在 PATH 里

有些服务器虽然装了 Node.js，但 PowerShell 找不到 `npm`。

先试这个命令：

```powershell
& "C:\Program Files\nodejs\npm.cmd" -v
```

如果有版本号，再执行：

```powershell
cd C:\Apps\muvs-dashboard
& "C:\Program Files\nodejs\npm.cmd" install
```

后面启动也可以这样执行：

```powershell
cd C:\Apps\muvs-dashboard
& "C:\Program Files\nodejs\npm.cmd" start
```

#### 方法 4：把 Node.js 加到系统 PATH

如果你想以后直接用 `npm`，需要确认下面这个目录已经在系统 PATH 里：

```powershell
C:\Program Files\nodejs\
```

加完以后：

1. 关闭 PowerShell
2. 重新打开 PowerShell
3. 再执行 `npm -v`

## 五、先手动启动测试一次

继续在 PowerShell 里执行：

```powershell
cd C:\Apps\muvs-dashboard
npm start
```

如果启动成功，浏览器打开：

```powershell
http://localhost:3036/nav
```

如果能看到导航页，就说明服务已经跑起来了。

## 六、查服务器 IP

在 PowerShell 里执行：

```powershell
ipconfig
```

找到这台服务器的 IPv4 地址。

举例：

```powershell
192.168.1.25
```

那其他电脑访问地址就是：

```powershell
http://192.168.1.25:3036/nav
```

## 七、设置开机自动启动

停止刚才手动启动的服务，按：

```powershell
Ctrl + C
```

然后继续执行：

```powershell
cd C:\Apps\muvs-dashboard
powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-task.ps1
```

这个脚本会自动帮你做两件事：

1. 创建开机自动运行任务 `MUVS-Dashboard`
2. 放行 Windows 防火墙的 3036 端口

## 八、验证自动启动任务

你可以这样检查：

1. 打开 Windows 的“任务计划程序”
2. 找到任务 `MUVS-Dashboard`
3. 右键手动运行一次

然后再次打开：

```powershell
http://localhost:3036/nav
```

如果能打开，说明开机任务配置成功。

## 九、现场电脑怎么访问

其他电脑不要用 `localhost`。

其他电脑应该访问服务器 IP，比如：

```powershell
http://192.168.1.25:3036/nav
http://192.168.1.25:3036/
http://192.168.1.25:3036/board
```

对应关系：

1. `/nav` 是导航页
2. `/` 是主看板
3. `/board` 是现场大屏

## 十、最常见的 4 个问题

### 1. 浏览器打不开页面

先检查：

1. 服务是不是启动了
2. 3036 端口有没有被防火墙拦住
3. 访问时是不是用了服务器真实 IP，而不是 `localhost`

### 2. 页面能打开，但是没有数据

先检查：

1. `.env` 里的数据库账号密码对不对
2. 服务器能不能连到 `PRCCJ-MSGCR01`
3. 数据库账号 `sa` 是否还能正常使用

### 3. 服务器重启后页面打不开

先检查：

1. `MUVS-Dashboard` 计划任务是否存在
2. 这个任务是否成功启动
3. `node` 是否在服务器上正常安装

### 3.1 执行 `npm install` 时报 `npm is not recognized`

先检查：

1. Node.js 是否真的安装了
2. 安装后 PowerShell 是否重新打开过
3. `C:\Program Files\nodejs\` 是否在 PATH 里
4. 能不能直接运行：

```powershell
& "C:\Program Files\nodejs\npm.cmd" -v
```

### 4. 现场大屏想少显示几个料口

直接在页面里用“显示料口”功能勾选即可，不需要改数据库。

## 十一、你以后最常用的命令

### 安装依赖

```powershell
cd C:\Apps\muvs-dashboard
npm install
```

如果 `npm` 不识别，就改用：

```powershell
cd C:\Apps\muvs-dashboard
& "C:\Program Files\nodejs\npm.cmd" install
```

### 手动启动

```powershell
cd C:\Apps\muvs-dashboard
npm start
```

如果 `npm` 不识别，就改用：

```powershell
cd C:\Apps\muvs-dashboard
& "C:\Program Files\nodejs\npm.cmd" start
```

### 安装开机启动

```powershell
cd C:\Apps\muvs-dashboard
powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-task.ps1
```

### 打开导航页

```powershell
http://localhost:3036/nav
```

## 十二、最简单结论

如果你只想记住最少步骤，就记这 6 步：

1. 复制项目到 `C:\Apps\muvs-dashboard`
2. 把 `.env.server.example` 复制成 `.env`
3. 管理员 PowerShell 打开项目目录
4. 执行 `npm install`
5. 执行 `powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-task.ps1`
6. 用 `http://服务器IP:3036/nav` 访问