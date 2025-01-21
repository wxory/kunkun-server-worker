export default {
  async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // 定义路由映射
      const routes = {
          'POST /status': handlePostStatus,
          'GET /status/latest': handleGetLatestStatus,
          'GET /status/{client_id}/history': handleGetClientHistory,
          'GET /': handleGetIndex,
          'GET /status': handleGetStatus,
      };

      try {
          // 根据路径和方法匹配路由
          let routeKey = `${method} ${path}`;

          const clientIdMatch = path.match(/^\/status\/(\d+)\/history$/);
          if (clientIdMatch) {
              routeKey = 'GET /status/{client_id}/history';
              url.clientId = clientIdMatch[1]; // Attach clientId to the URL object
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

// 处理 GET / 请求
async function handleGetIndex(request, env, url) {
  // 从 GitHub 拉取 kunlun.html 文件
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


async function handlePostStatus(request, env, url) {
  // 统计查询耗费的行数
  let rows_read = 0
  let rows_written = 0

  const formData = await request.formData();

  // 为所有字段提供默认值
  const machineId = formData.get('machine_id') || '';
  const uptime = parseInt(formData.get('uptime') || '0', 10);
  const load1min = parseFloat(formData.get('load_1min') || '0');
  const load5min = parseFloat(formData.get('load_5min') || '0');
  const load15min = parseFloat(formData.get('load_15min') || '0');
  const netTx = parseInt(formData.get('net_tx') || '0', 10);
  const netRx = parseInt(formData.get('net_rx') || '0', 10);
  const diskDelay = parseInt(formData.get('disk_delay') || '0', 10);
  const cpuDelay = parseInt(formData.get('cpu_delay') || '0', 10);
  const disksTotalKb = parseInt(formData.get('disks_total_kb') || '0', 10);
  const disksAvailKb = parseInt(formData.get('disks_avail_kb') || '0', 10);
  const tcpConnections = parseInt(formData.get('tcp_connections') || '0', 10);
  const udpConnections = parseInt(formData.get('udp_connections') || '0', 10);
  const cpuNumCores = parseInt(formData.get('cpu_num_cores') || '0', 10);
  const taskTotal = parseInt(formData.get('task_total') || '0', 10);
  const taskRunning = parseInt(formData.get('task_running') || '0', 10);
  const cpuUs = parseFloat(formData.get('cpu_us') || '0');
  const cpuSy = parseFloat(formData.get('cpu_sy') || '0');
  const cpuNi = parseFloat(formData.get('cpu_ni') || '0');
  const cpuId = parseFloat(formData.get('cpu_id') || '0');
  const cpuWa = parseFloat(formData.get('cpu_wa') || '0');
  const cpuHi = parseFloat(formData.get('cpu_hi') || '0');
  const cpuSt = parseFloat(formData.get('cpu_st') || '0');
  const memTotal = parseFloat(formData.get('mem_total') || '0');
  const memFree = parseFloat(formData.get('mem_free') || '0');
  const memUsed = parseFloat(formData.get('mem_used') || '0');
  const memBuffCache = parseFloat(formData.get('mem_buff_cache') || '0');

  // 获取或创建客户端记录
  let clientId;

  try {
      // 直接查询 clientId
      const { meta, results } = await env.DB
          .prepare('SELECT id FROM client WHERE machine_id = ?;')
          .bind(machineId)
          .run();
      rows_read += meta.rows_read
      rows_written += meta.rows_written

      console.log('results of machine_id of client:',results)

      if (results && results[0].id) {
          clientId = results[0].id;
      } else {
          // 查不到就再查一个 count + 1 作为 clientId  这里多此一举是因为 D1 的 最大行数是数据库共享的，clientId 会受 status 数据行的影响

          const { meta, results } = await env.DB
              .prepare('SELECT COUNT(*) AS count FROM client')
              .run();
          rows_read += meta.rows_read
          rows_written += meta.rows_written
          console.log('results of count of client:',results)

          // 插入新记录
          clientId = results[0].count + 1
          const { meta1, results1 } = await env.DB
              .prepare('INSERT INTO client (id, machine_id, name) VALUES (?,?,?);')
              .bind(clientId, machineId, 'node')
              .run();
          rows_read += meta1.rows_read
          rows_written += meta1.rows_written
      }
  } catch (error) {
      console.error('Database error:', error);
      return new Response('Database error', { status: 500 });
  }

  // 插入状态数据
  try {
      const { meta, results } = await env.DB
          .prepare(
              `INSERT INTO status (
          client_id, insert_utc_ts, uptime, load_1min, load_5min, load_15min,
          net_tx, net_rx, disk_delay, cpu_delay, disks_total_kb, disks_avail_kb,
          tcp_connections, udp_connections, cpu_num_cores, task_total, task_running,
          cpu_us, cpu_sy, cpu_ni, cpu_id, cpu_wa, cpu_hi, cpu_st, mem_total, mem_free, mem_used, mem_buff_cache
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
          )
          .bind(
              clientId,
              Math.floor(Date.now() / 1000),
              uptime,
              load1min,
              load5min,
              load15min,
              netTx,
              netRx,
              diskDelay,
              cpuDelay,
              disksTotalKb,
              disksAvailKb,
              tcpConnections,
              udpConnections,
              cpuNumCores,
              taskTotal,
              taskRunning,
              cpuUs,
              cpuSy,
              cpuNi,
              cpuId,
              cpuWa,
              cpuHi,
              cpuSt,
              memTotal,
              memFree,
              memUsed,
              memBuffCache
          )
          .run();
      rows_read += meta.rows_read
      rows_written += meta.rows_written
      return new Response(JSON.stringify({ status: 'ok', client_id: clientId }), {
          headers: {
              'Content-Type': 'application/json',
              'X-d1-rows-read': String(rows_read),
              'X-d1-rows-written': String(rows_written),
          },
      });
  } catch (error) {
      console.error('Failed to insert status data:', error);
      return new Response('Failed to insert status data', { status: 500 });
  }
}

// 处理 GET /status/latest 请求
async function handleGetLatestStatus(request, env, url) {
  let rows_read = 0
  let rows_written = 0

  const { meta, results } = await env.DB
      .prepare(
          `SELECT 
            c.machine_id, c.name, s.*
          FROM (
            SELECT 
              *, 
              ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY insert_utc_ts DESC) AS rn
            FROM 
              status
          ) s
          JOIN 
            client c ON s.client_id = c.id
          WHERE 
            s.rn = 1;`
      )
      .run();
  rows_read += meta.rows_read
  rows_written += meta.rows_written

  return new Response(JSON.stringify(results), {
      headers: {
          'Content-Type': 'application/json',
          'X-d1-rows-read': String(rows_read),
          'X-d1-rows-written': String(rows_written),
      },

  });
}


// 处理 GET /status/{client_id}/history 请求
async function handleGetClientHistory(request, env, url) {
  let rows_read = 0
  let rows_written = 0


  const clientId = url.clientId;
  const columns = url.searchParams.get('columns');
  const seconds = parseInt(url.searchParams.get('seconds'), 10);
  const limit = parseInt(url.searchParams.get('limit') || '60', 10); // 默认值为 60

  const columnsList = columns.split(',').map((col) => col.trim());
  const currentTime = Math.floor(Date.now() / 1000);
  const startTime = currentTime - seconds;

  const { meta, results } = await env.DB
      .prepare(
          `SELECT ${columnsList.join(', ')}, insert_utc_ts
       FROM status
       WHERE client_id = ? AND insert_utc_ts >= ?
       ORDER BY insert_utc_ts ASC;`
      )
      .bind(clientId, startTime)
      .all();
  rows_read += meta.rows_read
  rows_written += meta.rows_written

  if (!results.length) {
      return new Response(JSON.stringify({ client_id: clientId, data: [] }), {
          headers: {
              'Content-Type': 'application/json',
              'X-d1-rows-read': String(rows_read),
              'X-d1-rows-written': String(rows_written),
          },
      });
  }

  // 调用采样函数，传入 limit
  const sampledData = sampleData(results, columnsList, limit);

  return new Response(JSON.stringify({ client_id: clientId, data: sampledData }), {
      headers: {
          'Content-Type': 'application/json',
          'X-d1-rows-read': String(rows_read),
          'X-d1-rows-written': String(rows_written),
      },
  });
}

// 采样函数
function sampleData(results, columns, limit) {
  const sampledData = [];
  columns.forEach((col) => {
      const data = results.map((row) => row[col]);
      if (data.length > limit) {
          const step = data.length / limit;
          sampledData.push(Array.from({ length: limit }, (_, i) => data[Math.floor(i * step)]));
      } else {
          sampledData.push(data);
      }
  });
  return sampledData;
}

