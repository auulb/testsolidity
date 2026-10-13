/**
 * 极简静态服务器，只为跑本地前端用。
 * 用 node 内置模块写的，不引入任何额外依赖 —— 顺便让你看看"一个服务器有多简单"。
 *
 * 额外做了一件事：把 node_modules 里的 ethers.js 浏览器版映射到 /vendor/ethers.umd.min.js，
 * 这样前端不用连 CDN，断网也能跑。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const ETHERS_FILE = path.join(
  __dirname,
  "..",
  "node_modules",
  "ethers",
  "dist",
  "ethers.umd.min.js"
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * 禁止浏览器缓存。
 *
 * 为什么必须这么做：contracts.js 里的合约地址每次 `npm run deploy` 都会变。
 * 如果浏览器缓存了旧的 contracts.js，页面就会拿着一个「上一个链上的地址」去调合约，
 * 报出各种莫名其妙的错（调用不存在的方法、余额恒为 0……），而且刷新都不一定管用。
 * 开发环境里正确性和「所见即所得」比省那几 KB 流量重要得多。
 */
const NO_CACHE = { "Cache-Control": "no-store, must-revalidate" };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  // 特殊路由：把 ethers 的浏览器版喂给前端
  if (urlPath === "/vendor/ethers.umd.min.js") {
    if (!fs.existsSync(ETHERS_FILE)) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("找不到 ethers。请先在项目根目录运行 npm install。");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      ...NO_CACHE,
    });
    fs.createReadStream(ETHERS_FILE).pipe(res);
    return;
  }

  // 普通静态文件，默认 index.html
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(FRONTEND_DIR, relative);

  // 防目录穿越：解析后的路径必须还在 frontend 目录里
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      `404 找不到 ${urlPath}\n\n` +
        (urlPath === "/contracts.js"
          ? "提示：contracts.js 由部署脚本生成。先跑 `npm run node`，再 `npm run deploy`。"
          : "")
    );
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    ...NO_CACHE,
  });
  fs.createReadStream(filePath).pipe(res);
});

// 端口被占用时给出能直接照做的提示，而不是丢一堆 EADDRINUSE 堆栈
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ 端口 ${PORT} 已被占用（可能有别的开发服务器在跑）`);
    console.error(`   换个端口即可：  PORT=${PORT + 1} npm run frontend\n`);
  } else {
    console.error("\n❌ 服务器启动失败:", err.message, "\n");
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n🌐 前端已启动: http://localhost:${PORT}\n`);
  console.log("   打开前请确认：");
  console.log("   1) 本地链在跑（npm run node）");
  console.log("   2) 合约已部署（npm run deploy）");
  console.log("   3) MetaMask 已切到 Localhost 31337 网络\n");
  console.log("   按 Ctrl+C 停止\n");
});
