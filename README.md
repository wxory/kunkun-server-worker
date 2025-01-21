# Kunlun Server Worker

Kunlun 是一个轻量级（客户端内存占用 < 1MB）、高效（仅一个 .c 文件）的服务器监控系统，帮助用户实时监控服务器的性能指标，并通过直观的 Web 界面展示数据。系统由 **Kunlun Server**（后端）和 **Kunlun Client**（客户端）组成，支持跨平台部署，适用于各种 Linux 环境。本仓库是基于 `Cloudflare Worker` + `D1`的 Kunlun Server 实现，免费额度已足够轻量监控。

## 快速开始

### 1. 部署 Worker 版 Kunlun Server

#### 1.1 准备 Cloudflare D1 数据库
进入 Cloudflare 控制台 -> 存储和数据库 -> D1 SQL 数据库 -> 点击 创建 按钮 ->
自动跳转到 创建 D1 数据库 页面 -> 输入数据库名称为 kunlun  -> 点击 创建 按钮
自动跳转到 D1 kunlun 数据表页面 -> 进入顶栏菜单的 控制台 -> 依次复制以下 5 个数据库创建命令，粘贴到控制台执行 -> 5 次都执行成功后，数据库已就绪

```SQL
CREATE TABLE IF NOT EXISTS client (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL UNIQUE,
      name TEXT
);
```

```SQL
CREATE TABLE IF NOT EXISTS status (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   client_id INTEGER NOT NULL, 
   insert_utc_ts INTEGER NOT NULL, 
   uptime INTEGER, 
   load_1min REAL, 
   load_5min REAL, 
   load_15min REAL, 
   net_tx INTEGER, 
   net_rx INTEGER, 
   disk_delay INTEGER, 
   cpu_delay INTEGER, 
   disks_total_kb INTEGER, 
   disks_avail_kb INTEGER, 
   tcp_connections INTEGER, 
   udp_connections INTEGER, 
   cpu_num_cores INTEGER, 
   task_total INTEGER, 
   task_running INTEGER, 
   cpu_us REAL, 
   cpu_sy REAL, 
   cpu_ni REAL, 
   cpu_id REAL, 
   cpu_wa REAL, 
   cpu_hi REAL, 
   cpu_st REAL, 
   mem_total REAL, 
   mem_free REAL, 
   mem_used REAL, 
   mem_buff_cache REAL, 
   FOREIGN KEY (client_id) REFERENCES client(id)
);
```


```SQL
CREATE INDEX IF NOT EXISTS idx_client_id_time
ON status (client_id, insert_utc_ts);
```


20250121 更新：发现之前的查询非常的耗费查询行数，如果你是之前安装创建完毕了数据库的话，需要增加下面的两步操作减少数万倍的 D1 查询行数消耗

```SQL
CREATE TABLE latest_status (
    client_id INTEGER PRIMARY KEY,
    status_id INTEGER,
    insert_utc_ts INTEGER
);
```


```SQL
CREATE TRIGGER update_latest_status
AFTER INSERT ON status
FOR EACH ROW
BEGIN
    INSERT OR REPLACE INTO latest_status (client_id, status_id, insert_utc_ts)
    VALUES (NEW.client_id, NEW.id, NEW.insert_utc_ts);
END;
```



#### 1.2 准备 Cloudflare Worker

进入 Cloudflare 控制台 -> Compute -> Workers 和 Pages -> 点击 `创建` 按钮 -> `创建 Worker` -> 自己起个名字 -> 点击 `部署` 按钮（稍等几秒） -> 自动跳转到成功页面 -> 点击右上角 `编辑代码` 按钮 -> [打开这个链接 ](https://github.com/hochenggang/kunlun-server-worker/blob/main/kunlun.worker.js)复制这里的代码替换 Worker 编辑页面的 worker.js 的内容 -> 点击 `部署` 按钮 -> 点击左上角的 `返回` 按钮 -> 回到 Worker 页面 -> 进入顶栏 `设置` -> `绑定` -> 点击 `添加` 按钮 -> 选择 `D1 数据库` -> `变量名称` 写 `DB`  然后 `D1 数据库`选择上一步创建那个 -> 点击 `部署` ->  至此服务端部署已完成


#### 1.3 尝试访问 Worker 地址

在浏览器中访问 `https://xxxx.workers.dev/`，即可查看服务器监控仪表盘，你也可以在 Worker 设置页面绑定你自己的域名。

默认应该没有数据显示，你还需要到你的某台服务器安装下面的客户端，填写对应的上报地址后才会有数据显示。

---

### 2. 安装 Kunlun Client


#### 使用安装脚本

在需要监控的服务器上运行以下命令：

```bash
curl -L https://github.com/hochenggang/kunlun/raw/refs/heads/main/kunlun-client-install.sh -o kunlun-client-install.sh
chmod +x kunlun-client-install.sh
./kunlun-client-install.sh
```

建议保持默认监测间隔（10秒）

上报地址填写你的 Worker 地址（如 `https://xxx.workers.dev/status`）即可完成客户端安装，客户端将每10秒上报一次状态信息到 Worker。

如果填错了，重新运行 `./kunlun-client-install.sh` 选择卸载再重新安装。


至此你已经可以正常使用全部的功能了。

---
---


## 功能特性

### **实时监控**
- 采集 CPU、内存、磁盘、网络等关键性能指标。
- 支持多台服务器的集中监控。

### **历史数据查询**
- 提供过去一段时间内的性能数据查询功能。
- 支持数据采样和可视化展示。

### **轻量高效**
- 后端基于 Cloudflare Worker + D1 ，免费额度基本够轻量使用。
- 客户端基于 C 语言实现，性能优异。编译后小于1MB，内存占用极低。

---

## 系统架构

Kunlun Server Monitoring 由以下组件组成：

1. **Kunlun Server**（后端）：
   - 基于 Cloudflare Worker 提供 RESTful API，用于接收和存储客户端上报的数据。
   - 使用 Cloudflare D1 作为轻量级数据库，支持数据持久化。
   - 提供 Web 界面，展示实时和历史监控数据。

2. **Kunlun Client**（客户端）：
   - 基于 C 语言实现，实时采集服务器性能指标。
   - 支持自定义上报地址和监测间隔。
   - 通过 HTTP POST 请求将数据上报到 Kunlun Server。
   - 细节参见 [Github-kunlun](https://github.com/hochenggang/kunlun.git)



---

## 贡献指南

欢迎提交 Issue 或 Pull Request 为 Kunlun Server Monitoring 贡献力量！

---

## 许可证

Kunlun Server Monitoring 基于 [MIT 许可证](https://opensource.org/licenses/MIT) 开源。

---

## 联系我们

如有问题或建议，请通过 GitHub Issues 联系我。

---

感谢使用 Kunlun Server Monitoring！