export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // 定义路由映射
        const routes = {
            'POST /status': handlePostStatus,
            'GET /status/latest': handleGetLatestStatus,
            'GET /status/seconds': handleGetStatusSeconds,
            'GET /status/minutes': handleGetStatusMinutes,
            'GET /status/hours': handleGetStatusHours,
            'GET /': handleGetIndex,
            'GET /status': handleGetStatus,
            'GET /init': handleInitDB, // 新增 /init 路由
        };

        try {
            // 根据路径和方法匹配路由
            let routeKey = `${method} ${path}`;

            // 处理带参数的路径
            const clientId = url.searchParams.get('client_id');
            if (clientId) {
                // 根据路径和方法匹配路由
                if (path === '/status/seconds') {
                    routeKey = 'GET /status/seconds';
                    url.clientId = clientId; // 将 clientId 附加到 URL 对象
                } else if (path === '/status/minutes') {
                    routeKey = 'GET /status/minutes';
                    url.clientId = clientId;
                } else if (path === '/status/hours') {
                    routeKey = 'GET /status/hours';
                    url.clientId = clientId;
                }
            }

            // 获取对应的处理函数
            const handler = routes[routeKey];

            if (handler) {
                return await handler(request, env, url);
            } else {
                return new Response('Not Found', { status: 404 });
            }
        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    },
};


// 初始化数据库
async function initDB(env) {
    try {
        // 创建 client 表
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS client (
                id INTEGER PRIMARY KEY NOT NULL,
                machine_id TEXT UNIQUE NOT NULL,
                hostname TEXT NOT NULL
            )
        `).run();

        // 定义状态表的字段
        const columns = `
            timestamp INTEGER NOT NULL,
            uptime_s INTEGER NOT NULL,
            load_1min REAL NOT NULL,
            load_5min REAL NOT NULL,
            load_15min REAL NOT NULL,
            running_tasks INTEGER NOT NULL,
            total_tasks INTEGER NOT NULL,
            cpu_user REAL NOT NULL,
            cpu_system REAL NOT NULL,
            cpu_nice REAL NOT NULL,
            cpu_idle REAL NOT NULL,
            cpu_iowait REAL NOT NULL,
            cpu_irq REAL NOT NULL,
            cpu_softirq REAL NOT NULL,
            cpu_steal REAL NOT NULL,
            mem_total_mib REAL NOT NULL,
            mem_free_mib REAL NOT NULL,
            mem_used_mib REAL NOT NULL,
            mem_buff_cache_mib REAL NOT NULL,
            tcp_connections INTEGER NOT NULL,
            udp_connections INTEGER NOT NULL,
            default_interface_net_rx_bytes INTEGER NOT NULL,
            default_interface_net_tx_bytes INTEGER NOT NULL,
            cpu_num_cores INTEGER NOT NULL,
            cpu_delay_us INTEGER NOT NULL,
            disk_delay_us INTEGER NOT NULL,
            root_disk_total_kb INTEGER NOT NULL,
            root_disk_avail_kb INTEGER NOT NULL,
            reads_completed INTEGER NOT NULL,
            writes_completed INTEGER NOT NULL,
            reading_ms INTEGER NOT NULL,
            writing_ms INTEGER NOT NULL,
            iotime_ms INTEGER NOT NULL,
            ios_in_progress INTEGER NOT NULL,
            weighted_io_time INTEGER NOT NULL
        `;

        // 创建 status_latest 表
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS status_latest (
                client_id INTEGER PRIMARY KEY,
                ${columns},
                FOREIGN KEY (client_id) REFERENCES client(id)
            )
        `).run();

        // 创建 status_seconds 表
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS status_seconds (
                client_id INTEGER NOT NULL,
                ${columns},
                PRIMARY KEY (client_id, timestamp),
                FOREIGN KEY (client_id) REFERENCES client(id)
            )
        `).run();

        // 创建 status_minutes 表
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS status_minutes (
                client_id INTEGER NOT NULL,
                ${columns},
                PRIMARY KEY (client_id, timestamp),
                FOREIGN KEY (client_id) REFERENCES client(id)
            )
        `).run();

        // 创建 status_hours 表
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS status_hours (
                client_id INTEGER NOT NULL,
                ${columns},
                PRIMARY KEY (client_id, timestamp),
                FOREIGN KEY (client_id) REFERENCES client(id)
            )
        `).run();

        return true;
    } catch (error) {
        console.error('Failed to initialize database:', error);
        return false;
    }
}

// 处理 /init 请求
async function handleInitDB(request, env, url) {
    const success = await initDB(env);
    if (success) {
        return new Response('Database initialized successfully', {
            headers: { 'Content-Type': 'text/plain' },
        });
    } else {
        return new Response('Failed to initialize database', { status: 500 });
    }
}


// 处理 GET / 请求
async function handleGetIndex(request, env, url) {
    const htmlUrl = 'https://raw.githubusercontent.com/hochenggang/kunlun-server-worker/refs/heads/main/kunlun.html';
    const response = await fetch(htmlUrl);

    if (response.ok) {
        const html = await response.text();
        return new Response(html, {
            headers: { 'Content-Type': 'text/html' },
        });
    } else {
        return new Response('Failed to load HTML file', { status: 500 });
    }
}

// 处理 GET /status 请求
async function handleGetStatus(request, env, url) {
    return new Response('kunlun', {
        headers: { 'Content-Type': 'text/plain' },
    });
}



const FIELDS_LIST = [
    "timestamp", "uptime_s", "load_1min", "load_5min", "load_15min",
    "running_tasks", "total_tasks", "cpu_user", "cpu_system", "cpu_nice",
    "cpu_idle", "cpu_iowait", "cpu_irq", "cpu_softirq", "cpu_steal",
    "mem_total_mib", "mem_free_mib", "mem_used_mib", "mem_buff_cache_mib",
    "tcp_connections", "udp_connections", "default_interface_net_rx_bytes",
    "default_interface_net_tx_bytes", "cpu_num_cores", "cpu_delay_us",
    "disk_delay_us", "root_disk_total_kb", "root_disk_avail_kb",
    "reads_completed", "writes_completed", "reading_ms", "writing_ms",
    "iotime_ms", "ios_in_progress", "weighted_io_time", "machine_id", "hostname"
];

// 定义非累计型字段
const NON_CUMULATIVE_FIELDS = [
    'timestamp', 'uptime_s', 'load_1min', 'load_5min', 'load_15min',
    'running_tasks', 'total_tasks', 'mem_total_mib', 'mem_free_mib',
    'mem_used_mib', 'mem_buff_cache_mib', 'tcp_connections', 'udp_connections',
    'cpu_num_cores', 'cpu_delay_us', 'disk_delay_us', 'root_disk_total_kb',
    'root_disk_avail_kb', 'ios_in_progress', 'machine_id', 'hostname'
];

// 计算差值
function calculateDelta(newData, previousData) {
    const deltaData = newData.map((value, index) => {
        const fieldName = FIELDS_LIST[index];

        // 如果是非累计型字段，直接返回新数据
        if (NON_CUMULATIVE_FIELDS.includes(fieldName)) {
            return value;
        }

        // 如果是累计型字段，计算差值
        return parseFloat(value) - parseFloat(previousData[fieldName]);
    });
    return deltaData;
}

// 处理 POST /status 请求
async function handlePostStatus(request, env, url) {
    const formData = await request.formData();
    const values = formData.get('values');
    let valuesList = values.split(',');

    // 简单校验
    if (valuesList.length !== 37) {
        return new Response(`Invalid number of fields: ${valuesList.length}`, { status: 400 });
    }

    const timestamp = parseInt(valuesList[0], 10);
    if (timestamp % 10 !== 0) {
        return new Response('Invalid timestamp', { status: 400 });
    }

    // 获取或创建客户端记录
    const machineId = valuesList[35];
    const hostname = valuesList[36];

    // 取其前35位數據字段
    valuesList = valuesList.slice(0, 35)

    let clientId;

    let rows_read = 0
    let rows_written = 0

    try {
        const { meta: metaQueryMachineId, results } = await env.DB
            .prepare('SELECT id FROM client WHERE machine_id = ?')
            .bind(machineId)
            .run();

        rows_read += metaQueryMachineId.rows_read
        rows_written += metaQueryMachineId.rows_written

        if (results && results.length > 0) {
            clientId = results[0].id;
            // 检查 hostname 是否需要更新
            if (results[0].hostname !== hostname) {
                const { meta: metaUpdateClient } = await env.DB
                    .prepare('UPDATE client SET hostname = ? WHERE id = ?')
                    .bind(hostname, clientId)
                    .run();

                rows_read += metaUpdateClient.rows_read
                rows_written += metaUpdateClient.rows_written
            }
        } else {
            // 插入新记录
            const { meta: metaCountResults, results: countResults } = await env.DB
                .prepare('SELECT MAX(id) AS max_id FROM client')
                .run();

            rows_read += metaCountResults.rows_read
            rows_written += metaCountResults.rows_written

            clientId = countResults[0].max_id ? countResults[0].max_id + 1 : 1;
            const { meta: metaInsertClient } = await env.DB
                .prepare('INSERT INTO client (id, machine_id, hostname) VALUES (?, ?, ?)')
                .bind(clientId, machineId, hostname)
                .run();

            rows_read += metaInsertClient.rows_read
            rows_written += metaInsertClient.rows_written
        }
    } catch (error) {
        return new Response(`Database error: ${error.message}`, { status: 500 });
    }



    // 查询前一条最新数据
    let previousData;
    try {
        const { meta: metaLatestResults, results: statusLatestResults } = await env.DB
            .prepare('SELECT * FROM status_latest WHERE client_id = ? ORDER BY timestamp DESC LIMIT 1')
            .bind(clientId)
            .run();

        rows_read += metaLatestResults.rows_read
        rows_written += metaLatestResults.rows_written

        if (statusLatestResults && statusLatestResults.length > 0) {
            previousData = statusLatestResults[0];
        }
    } catch (error) {
        return new Response(`Failed to fetch previous data: ${error.message}`, { status: 500 });
    }


    // 插入最新状态数据
    try {
        const { meta: metaInsertLatestResults } = await env.DB
            .prepare(`
                INSERT OR REPLACE INTO status_latest (
                    client_id, timestamp, uptime_s, load_1min, load_5min, load_15min,
                    running_tasks, total_tasks, cpu_user, cpu_system, cpu_nice, cpu_idle,
                    cpu_iowait, cpu_irq, cpu_softirq, cpu_steal, mem_total_mib, mem_free_mib,
                    mem_used_mib, mem_buff_cache_mib, tcp_connections, udp_connections,
                    default_interface_net_rx_bytes, default_interface_net_tx_bytes,
                    cpu_num_cores, cpu_delay_us, disk_delay_us, root_disk_total_kb,
                    root_disk_avail_kb, reads_completed, writes_completed, reading_ms,
                    writing_ms, iotime_ms, ios_in_progress, weighted_io_time
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(clientId, ...valuesList)
            .run();

        rows_read += metaInsertLatestResults.rows_read
        rows_written += metaInsertLatestResults.rows_written
    } catch (error) {
        return new Response(`Failed to insert status_latest data: ${error.message}`, { status: 500 });
    }


    // 如果有前一条数据，计算差值并插入 status_seconds
    if (previousData) {
        const deltaData = calculateDelta(valuesList, previousData);

        try {
            const { meta: metaInsertSencondsResults } = await env.DB
                .prepare(`
                    INSERT INTO status_seconds (
                        client_id, timestamp, uptime_s, load_1min, load_5min, load_15min,
                        running_tasks, total_tasks, cpu_user, cpu_system, cpu_nice, cpu_idle,
                        cpu_iowait, cpu_irq, cpu_softirq, cpu_steal, mem_total_mib, mem_free_mib,
                        mem_used_mib, mem_buff_cache_mib, tcp_connections, udp_connections,
                        default_interface_net_rx_bytes, default_interface_net_tx_bytes,
                        cpu_num_cores, cpu_delay_us, disk_delay_us, root_disk_total_kb,
                        root_disk_avail_kb, reads_completed, writes_completed, reading_ms,
                        writing_ms, iotime_ms, ios_in_progress, weighted_io_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `)
                .bind(clientId, ...deltaData)
                .run();

            rows_read += metaInsertSencondsResults.rows_read
            rows_written += metaInsertSencondsResults.rows_written

            // 清理超过 1 小时的秒级数据
            const { meta: metaDeleteSencondsResults } = await env.DB
                .prepare('DELETE FROM status_seconds WHERE client_id = ? AND timestamp < ?')
                .bind(clientId, timestamp - 3600)
                .run();


            rows_read += metaDeleteSencondsResults.rows_read
            rows_written += metaDeleteSencondsResults.rows_written
        } catch (error) {
            return new Response(`Failed to insert delta data: ${error.message} ${deltaData} ${deltaData.length}`, { status: 500 });
        }


        // 如果是每分钟的开始，汇总秒级数据并插入 status_minutes
        if (timestamp % 60 === 0) {
            try {
                const { meta: metaInsertMinutesResults } = await env.DB
                    .prepare(`
                        INSERT INTO status_minutes (
                            client_id, timestamp, uptime_s, load_1min, load_5min, load_15min,
                            running_tasks, total_tasks, cpu_user, cpu_system, cpu_nice, cpu_idle,
                            cpu_iowait, cpu_irq, cpu_softirq, cpu_steal, mem_total_mib, mem_free_mib,
                            mem_used_mib, mem_buff_cache_mib, tcp_connections, udp_connections,
                            default_interface_net_rx_bytes, default_interface_net_tx_bytes,
                            cpu_num_cores, cpu_delay_us, disk_delay_us, root_disk_total_kb,
                            root_disk_avail_kb, reads_completed, writes_completed, reading_ms,
                            writing_ms, iotime_ms, ios_in_progress, weighted_io_time
                        )
                        SELECT
                            client_id,
                            MAX(timestamp),
                            ROUND(AVG(uptime_s), 2),
                            ROUND(AVG(load_1min), 2), ROUND(AVG(load_5min), 2), ROUND(AVG(load_15min), 2),
                            ROUND(AVG(running_tasks), 2), ROUND(AVG(total_tasks), 2),
                            ROUND(SUM(cpu_user), 2), ROUND(SUM(cpu_system), 2), ROUND(SUM(cpu_nice), 2),
                            ROUND(SUM(cpu_idle), 2), ROUND(SUM(cpu_iowait), 2), ROUND(SUM(cpu_irq), 2), ROUND(SUM(cpu_softirq), 2), ROUND(SUM(cpu_steal), 2),
                            ROUND(AVG(mem_total_mib), 2), ROUND(AVG(mem_free_mib), 2), ROUND(AVG(mem_used_mib), 2), ROUND(AVG(mem_buff_cache_mib), 2),
                            ROUND(AVG(tcp_connections), 2), ROUND(AVG(udp_connections), 2),
                            SUM(default_interface_net_rx_bytes), SUM(default_interface_net_tx_bytes),
                            ROUND(AVG(cpu_num_cores), 2), ROUND(AVG(cpu_delay_us), 2), ROUND(AVG(disk_delay_us), 2),
                            ROUND(AVG(root_disk_total_kb), 2), ROUND(AVG(root_disk_avail_kb), 2),
                            SUM(reads_completed), SUM(writes_completed),
                            SUM(reading_ms), SUM(writing_ms), SUM(iotime_ms),
                            ROUND(AVG(ios_in_progress), 2), ROUND(SUM(weighted_io_time), 2)
                        FROM status_seconds
                        WHERE client_id = ? AND timestamp >= ? - 60
                        GROUP BY client_id;
                    `)
                    .bind(clientId, timestamp)
                    .run();

                rows_read += metaInsertMinutesResults.rows_read
                rows_written += metaInsertMinutesResults.rows_written

                // 清理超过 24 小时的分钟级数据
                const { meta: metaDeleteMinutesResults } = await env.DB
                    .prepare('DELETE FROM status_minutes WHERE client_id = ? AND timestamp < ?')
                    .bind(clientId, timestamp - 86400)
                    .run();

                rows_read += metaDeleteMinutesResults.rows_read
                rows_written += metaDeleteMinutesResults.rows_written


            } catch (error) {
                return new Response(`Failed to insert minute data: ${error.message}`, { status: 500 });
            }
        }

        // 如果是每小时的开始，汇总分钟级数据并插入 status_hours
        if (timestamp % 3600 === 0) {
            try {
                const { meta: metaInsertHoursResults } = await env.DB
                    .prepare(`
                        INSERT INTO status_hours (
                            client_id, timestamp, uptime_s, load_1min, load_5min, load_15min,
                            running_tasks, total_tasks, cpu_user, cpu_system, cpu_nice, cpu_idle,
                            cpu_iowait, cpu_irq, cpu_softirq, cpu_steal, mem_total_mib, mem_free_mib,
                            mem_used_mib, mem_buff_cache_mib, tcp_connections, udp_connections,
                            default_interface_net_rx_bytes, default_interface_net_tx_bytes,
                            cpu_num_cores, cpu_delay_us, disk_delay_us, root_disk_total_kb,
                            root_disk_avail_kb, reads_completed, writes_completed, reading_ms,
                            writing_ms, iotime_ms, ios_in_progress, weighted_io_time
                        )
                        SELECT
                            client_id,
                            MAX(timestamp),
                            ROUND(AVG(uptime_s), 2),
                            ROUND(AVG(load_1min), 2), ROUND(AVG(load_5min), 2), ROUND(AVG(load_15min), 2),
                            ROUND(AVG(running_tasks), 2), ROUND(AVG(total_tasks), 2),
                            ROUND(SUM(cpu_user), 2), ROUND(SUM(cpu_system), 2), ROUND(SUM(cpu_nice), 2),
                            ROUND(SUM(cpu_idle), 2), ROUND(SUM(cpu_iowait), 2), ROUND(SUM(cpu_irq), 2), ROUND(SUM(cpu_softirq), 2), ROUND(SUM(cpu_steal), 2),
                            ROUND(AVG(mem_total_mib), 2), ROUND(AVG(mem_free_mib), 2), ROUND(AVG(mem_used_mib), 2), ROUND(AVG(mem_buff_cache_mib), 2),
                            ROUND(AVG(tcp_connections), 2), ROUND(AVG(udp_connections), 2),
                            SUM(default_interface_net_rx_bytes), SUM(default_interface_net_tx_bytes),
                            ROUND(AVG(cpu_num_cores), 2), ROUND(AVG(cpu_delay_us), 2), ROUND(AVG(disk_delay_us), 2),
                            ROUND(AVG(root_disk_total_kb), 2), ROUND(AVG(root_disk_avail_kb), 2),
                            SUM(reads_completed), SUM(writes_completed),
                            SUM(reading_ms), SUM(writing_ms), SUM(iotime_ms),
                            ROUND(AVG(ios_in_progress), 2), ROUND(SUM(weighted_io_time), 2)
                        FROM status_minutes
                        WHERE client_id = ? AND timestamp >= ? - 3600
                        GROUP BY client_id;
                    `)
                    .bind(clientId, timestamp)
                    .run();
                rows_read += metaInsertHoursResults.rows_read
                rows_written += metaInsertHoursResults.rows_written

                // 清理超过 365 天的小时级数据
                const { meta: metaDeleteHoursResults } = await env.DB
                    .prepare('DELETE FROM status_hours WHERE client_id = ? AND timestamp < ?')
                    .bind(clientId, timestamp - 31536000)
                    .run();
                rows_read += metaDeleteHoursResults.rows_read
                rows_written += metaDeleteHoursResults.rows_written
            } catch (error) {
                return new Response(`Failed to insert hour data: ${error.message}`, { status: 500 });
            }
        }

        return new Response(JSON.stringify({ ok: 2 }), {
            headers: {
                'Content-Type': 'application/json',
                'X-d1-rows-read': String(rows_read),
                'X-d1-rows-written': String(rows_written),
            },
        });

    } else {
        return new Response(JSON.stringify({ ok: 1 }), {
            headers: {
                'Content-Type': 'application/json',
                'X-d1-rows-read': String(rows_read),
                'X-d1-rows-written': String(rows_written),
            },
        });
    }

}


// 处理 GET /status/latest 请求
async function handleGetLatestStatus(request, env, url) {
    // 统计查询耗费的行数
    let rows_read = 0
    let rows_written = 0
    try {
        const { meta, results } = await env.DB
            .prepare(`
                SELECT sl.*, c.machine_id, c.hostname
                FROM status_latest sl
                JOIN client c ON sl.client_id = c.id
                WHERE sl.timestamp = (
                    SELECT MAX(timestamp)
                    FROM status_latest
                    WHERE client_id = sl.client_id
                )
            `)
            .run();

        rows_read += meta.rows_read;
        rows_written += meta.rows_written;

        return new Response(JSON.stringify(results), {
            headers: {
                'Content-Type': 'application/json',
                'X-d1-rows-read': String(rows_read),
                'X-d1-rows-written': String(rows_written),
            },
        });
    } catch (error) {
        return new Response(`Database error: ${error.message}`, { status: 500 });
    }
}

// 处理 GET /status/seconds 请求
async function handleGetStatusSeconds(request, env, url) {

    const clientId = url.clientId;
    const limit = url.searchParams.get('limit') || 360;

    let rows_read = 0
    let rows_written = 0

    try {
        const { meta, results } = await env.DB
            .prepare('SELECT * FROM status_seconds WHERE client_id = ? ORDER BY timestamp DESC LIMIT ?')
            .bind(clientId, limit)
            .run();

        rows_read += meta.rows_read;
        rows_written += meta.rows_written;

        return new Response(JSON.stringify(results), {
            headers: {
                'Content-Type': 'application/json',
                'X-d1-rows-read': String(rows_read),
                'X-d1-rows-written': String(rows_written),
            },
        });
    } catch (error) {
        return new Response(`Database error: ${error.message}`, { status: 500 });
    }
}

// 处理 GET /status/minutes 请求
async function handleGetStatusMinutes(request, env, url) {
    const clientId = url.clientId;
    const limit = url.searchParams.get('limit') || 1440;

    let rows_read = 0
    let rows_written = 0

    try {
        const { meta, results } = await env.DB
            .prepare('SELECT * FROM status_minutes WHERE client_id = ? ORDER BY timestamp DESC LIMIT ?')
            .bind(clientId, limit)
            .run();

        rows_read += meta.rows_read;
        rows_written += meta.rows_written;
        return new Response(JSON.stringify(results), {
            headers: {
                'Content-Type': 'application/json',
                'X-d1-rows-read': String(rows_read),
                'X-d1-rows-written': String(rows_written),
            },
        });
    } catch (error) {
        return new Response(`Database error: ${error.message}`, { status: 500 });
    }
}

// 处理 GET /status/hours 请求
async function handleGetStatusHours(request, env, url) {
    const clientId = url.clientId;
    const limit = url.searchParams.get('limit') || 8760;

    let rows_read = 0
    let rows_written = 0

    try {
        const { meta, results } = await env.DB
            .prepare('SELECT * FROM status_hours WHERE client_id = ? ORDER BY timestamp DESC LIMIT ?')
            .bind(clientId, limit)
            .run();

        rows_read += meta.rows_read;
        rows_written += meta.rows_written;
        return new Response(JSON.stringify(results), {
            headers: {
                'Content-Type': 'application/json',
                'X-d1-rows-read': String(rows_read),
                'X-d1-rows-written': String(rows_written),
            },
        });
    } catch (error) {
        return new Response(`Database error: ${error.message}`)
    }
}