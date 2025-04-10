import { serve } from "https://deno.land/std/http/server.ts";
import { serveFile } from "https://deno.land/std/http/file_server.ts";

// --- Configuration ---
const apiMapping = {
  "/anthropic": "https://api.anthropic.com",
  "/cerebras": "https://api.cerebras.ai",
  "/cohere": "https://api.cohere.ai",
  "/discord": "https://discord.com/api",
  "/fireworks": "https://api.fireworks.ai",
  "/gemini": "https://generativelanguage.googleapis.com",
  "/groq": "https://api.groq.com/openai",
  "/huggingface": "https://api-inference.huggingface.co",
  "/meta": "https://www.meta.ai/api",
  "/novita": "https://api.novita.ai",
  "/nvidia": "https://integrate.api.nvidia.com",
  "/oaipro": "https://api.oaipro.com",
  "/openai": "https://api.openai.com",
  "/openrouter": "https://openrouter.ai/api",
  "/portkey": "https://api.portkey.ai",
  "/reka": "https://api.reka.ai",
  "/telegram": "https://api.telegram.org",
  "/together": "https://api.together.xyz",
  "/xai": "https://api.x.ai",
};

// Directly get environment variables from Deno.env
const PROXY_DOMAIN = Deno.env.get("PROXY_DOMAIN");
const PROXY_PASSWORD = Deno.env.get("PROXY_PASSWORD");
const PROXY_PORT = Deno.env.get("PROXY_PORT") || "8000";
const AUTH_COOKIE_NAME = "api_proxy_auth_token";

// Check environment variable
if (!PROXY_DOMAIN) {
  const errorMsg = "错误: PROXY_DOMAIN 环境变量未设置。请设置它（例如 'export PROXY_DOMAIN=myproxy.example.com'）然后重试。";
  console.error(errorMsg);
  throw new Error(errorMsg);
}

// Check authentication environment variable
if (!PROXY_PASSWORD) {
  console.warn(
    "警告: PROXY_PASSWORD 环境变量未设置。身份验证已禁用。"
  );
}

// --- Authentication Helper Functions ---

/**
 * 根据密码哈希生成简单的身份验证令牌。
 * @param {string} password
 * @returns {Promise<string>} - SHA-256 哈希的十六进制表示。
 */
async function generateAuthToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(digest));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * 检查当前请求是否通过 cookie 进行了身份验证。
 * @param {Request} request
 * @returns {Promise<boolean>}
 */
async function isAuthenticated(request: Request): Promise<boolean> {
  if (!PROXY_PASSWORD) {
    return true; // If no password is configured, always return true
  }

  const cookies = request.headers.get("Cookie") || "";
  const tokenMatch = cookies.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const receivedToken = tokenMatch ? tokenMatch[1] : null;

  if (!receivedToken) {
    return false;
  }

  const expectedToken = await generateAuthToken(PROXY_PASSWORD);
  return receivedToken === expectedToken;
}

/**
 * 生成 HTML 登录页面。
 * @param {string} [errorMessage] - 可选的错误信息。
 * @returns {Response} - 登录页面的 HTML 响应。
 */
function generateLoginPage(errorMessage = ""): Response {
  const errorHtml = errorMessage ? `<p class="error-message">${errorMessage}</p>` : "";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>需要登录</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta charset="UTF-8">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                background-image: url('https://raw.githubusercontent.com/Nshpiter/docker-accelerate/refs/heads/main/background.jpg'); /* 背景图片 */
                background-size: cover; /* 覆盖整个区域 */
                background-position: center; /* 居中显示 */
                background-repeat: no-repeat; /* 不重复 */
                background-attachment: fixed; /* 固定背景 */
                margin: 0;
            }
            .login-container {
                background-color: rgba(255, 255, 255, 0.75); /* 75% 不透明度 */
                padding: 30px 40px;
                border-radius: 12px; /* 圆角稍大 */
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15); /* 阴影更明显 */
                text-align: center;
                max-width: 380px; /* 稍微加宽 */
                width: 90%;
                backdrop-filter: blur(5px); /* 毛玻璃效果 */
                -webkit-backdrop-filter: blur(5px); /* 兼容 Safari */
                border: 1px solid rgba(255, 255, 255, 0.2); /* 邊框也更透明 */
            }
            h2 {
                color: #333;
                margin-bottom: 20px;
                font-weight: 600; /* 标题加粗 */
            }
            p {
                color: #444; /* 段落颜色加深 */
                margin-bottom: 25px;
            }
            form {
                display: flex;
                flex-direction: column;
            }
            label {
                text-align: left;
                margin-bottom: 8px; /* 标签和输入框距离 */
                color: #444; /* 标签颜色加深 */
                font-weight: bold;
                font-size: 14px; /* 标签字体稍小 */
            }
            input[type="password"] {
                padding: 12px 15px; /* 内边距调整 */
                margin-bottom: 18px; /* 输入框间距 */
                border: 1px solid #ccc;
                border-radius: 6px; /* 输入框圆角 */
                font-size: 16px;
                box-sizing: border-box; /* 防止 padding 影响宽度 */
                background-color: rgba(255, 255, 255, 0.8); /* 输入框稍微透明 */
            }
            input:focus {
                outline: none; /* 移除默认 focus 轮廓 */
                border-color: #007bff; /* focus 时边框变蓝 */
                box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25); /* 添加 focus 光晕 */
            }
            button {
                padding: 12px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 6px; /* 按钮圆角 */
                cursor: pointer;
                font-size: 16px;
                font-weight: 600; /* 按钮文字加粗 */
                transition: background-color 0.3s ease, box-shadow 0.3s ease; /* 添加阴影过渡 */
                margin-top: 10px; /* 按钮与上方元素间距 */
            }
            button:hover {
                background-color: #0056b3;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* 悬停时加深阴影 */
            }
            .error-message {
                color: #dc3545;
                margin-top: 15px;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <h2>需要登录</h2>
            <p>请输入密码以访问 API 代理。</p>
            <form action="/login" method="post">
                <label for="password">密码:</label>
                <input type="password" id="password" name="password" required>
                <button type="submit">登录</button>
            </form>
            ${errorHtml}
        </div>
    </body>
    </html>
    `;
  return new Response(html, {
    status: 401, // Unauthorized
    headers: { "Content-Type": "text/html; charset=UTF-8", 'WWW-Authenticate': 'Basic realm="API Proxy"' }, // Include WWW-Authenticate header
  });
}

/**
 * 处理 /login 的 POST 请求。
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleLogin(request: Request): Promise<Response> {
  if (!PROXY_PASSWORD) {
    console.error("PROXY_PASSWORD 环境变量未设置。");
    return new Response("身份验证后端配置错误。", { status: 500 });
  }

  try {
    const formData = await request.formData();
    const password = formData.get("password");

    if (password === PROXY_PASSWORD) {
      const token = await generateAuthToken(PROXY_PASSWORD);
      const cookieValue = `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
      return new Response(null, {
        status: 302, // Found (Redirect)
        headers: {
          "Location": "/",
          "Set-Cookie": cookieValue,
        },
      });
    } else {
      console.log("登录失败: 密码无效");
      return generateLoginPage("密码无效。");
    }
  } catch (error) {
    console.error("处理登录表单时出错:", error);
    return generateLoginPage("登录过程中发生错误。");
  }
}

// --- Main Request Handler ---
async function main(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // --- Authentication Check ---
  if (!PROXY_PASSWORD && pathname !== "/login") {
    console.log("跳过身份验证，因为未配置密码。");
  } else {
    if (pathname === "/login" && request.method === "POST") {
      return handleLogin(request);
    }

    const authenticated = await isAuthenticated(request);
    if (!authenticated && !Object.keys(apiMapping).some(prefix => pathname.startsWith(prefix))) {
      console.log(`需要身份验证: ${pathname}`);
      if (pathname === "/" || pathname === "/index.html") {
         return generateLoginPage();
      } else {
          return new Response("Unauthorized", { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="API Proxy"' } });
      }
    }

    console.log(`已验证访问: ${pathname}`);
  }

  // --- Route Requests ---
  if (pathname === "/" || pathname === "/index.html") {
    return handleDashboardPage(apiMapping, PROXY_DOMAIN);
  }

  if (pathname === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (pathname.startsWith("/public/")) {
    return serveStaticFile(request, `.${pathname}`);
  }

  const [prefix, rest] = extractPrefixAndRest(pathname, Object.keys(apiMapping));

  if (!prefix) {
    return new Response("Not Found: Invalid API path.", { status: 404 });
  }

  const targetUrl = `${apiMapping[prefix]}${rest}${url.search}`;

  try {
    const headers = new Headers();
    const allowedHeaders = ["accept", "content-type", "authorization"];
    for (const [key, value] of request.headers.entries()) {
      if (allowedHeaders.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Frame-Options", "DENY");
    responseHeaders.set("Referrer-Policy", "no-referrer");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`代理请求失败 for ${targetUrl}:`, error);
    return new Response("Internal Server Error: Proxy failed.", { status: 500 });
  }
}

function extractPrefixAndRest(pathname: string, prefixes: string[]): [string | null, string | null] {
  prefixes.sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      return [prefix, pathname.slice(prefix.length)];
    }
  }
  return [null, null];
}

async function handleDashboardPage(
  apiMapping: { [key: string]: string },
  domain: string
): Promise<Response> {
  let tableRows = "";
  const sortedPaths = Object.keys(apiMapping).sort();

  for (const proxyPath of sortedPaths) {
    const targetUrl = apiMapping[proxyPath];
    const fullProxyUrl = `https://${domain}${proxyPath}`;

    tableRows += `
      <tr class="service-card animate__animated animate__fadeInUp" style="animation-delay: ${
      Object.keys(apiMapping).indexOf(proxyPath) * 0.05
    }s;">
        <td>
          <div class="flex items-center">
            <i class="fas fa-robot service-icon" title="${proxyPath.substring(1)}"></i>
            <code class="code flex-grow mr-2 truncate" title="${fullProxyUrl}">${fullProxyUrl}</code>
            <button class="copy-button ml-auto flex-shrink-0" onclick="copyText('${fullProxyUrl}', this)">
              <i class="far fa-copy"></i>
            </button>
          </div>
        </td>
        <td><code class="code truncate" title="${targetUrl}">${targetUrl}</code></td>
        <td><span class="status-badge">在线</span></td>
      </tr>
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <title>API Proxy Service</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="安全可靠的 API 代理服务，提供常用 AI 和其他 API 的代理访问点。">
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔌</text></svg>">
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
        <style>
            :root {
              --header-gradient-start: #7928CA; /* Purple */
              --header-gradient-end: #FF0080;   /* Pink */
              --status-badge-bg: #22C55E;   /* Green */
              --link-color: #3B82F6;       /* Blue */
              --link-hover-color: #6366F1;   /* Indigo */
              --code-bg: #F3F4F6;        /* Gray */
              --code-text: #4B5563;       /* Dark Gray */
              --table-hover-bg: #F9FAFB;     /* Light Gray */
              --font-family: 'Inter', sans-serif;
            }

            body {
                font-family: var(--font-family);
                background-color: #f8fafc; /* Light background */
                color: #334155; /* Darker text */
                line-height: 1.6;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                min-height: 100vh;
            }

            .container {
                max-width: 1200px;
                margin: 2rem auto;
                padding: 0 1rem;
                flex: 1;
            }

            .header-card {
                background: linear-gradient(45deg, var(--header-gradient-start), var(--header-gradient-end));
                color: white;
                border-radius: 12px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                padding: 2rem;
                margin-bottom: 2rem;
                text-align: center;
            }

            .header-card h1 {
                font-size: 2.5rem;
                font-weight: 700;
                margin-bottom: 0.5rem;
                letter-spacing: -0.05em;
            }

            .header-card p {
                font-size: 1.125rem;
                opacity: 0.9;
            }

            .table-container {
                background-color: #fff;
                border-radius: 12px;
                box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
                overflow-x: auto; /* Handle overflow on smaller screens */
            }

            table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed; /* Prevents content from overflowing */
            }

            th, td {
                padding: 1rem;
                text-align: left;
                border-bottom: 1px solid #e5e7eb;
                word-break: break-all; /* Breaks long words */
            }

            th {
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                font-size: 0.875rem;
            }

            tbody tr:hover {
                background-color: var(--table-hover-bg);
            }

            .code {
                font-family: monospace;
                background-color: var(--code-bg);
                color: var(--code-text);
                padding: 0.25rem 0.5rem;
                border-radius: 6px;
                font-size: 0.875rem;
                word-break: break-all;
            }

            .service-icon {
                width: 20px;
                height: 20px;
                margin-right: 0.5rem;
                color: #9ca3af;
                flex-shrink: 0;
            }

            .copy-button {
                background-color: #e5e7eb;
                color: #4b5563;
                border: none;
                border-radius: 0.5rem;
                padding: 0.5rem 0.75rem;
                cursor: pointer;
                transition: background-color 0.2s, transform 0.1s;
                display: inline-flex;
                align-items: center;
                font-size: 0.75rem;
            }

            .copy-button:hover {
                background-color: #d1d5db;
            }

            .copy-button:active {
                transform: scale(0.95);
            }

            .status-badge {
                display: inline-block;
                padding: 0.375rem 0.75rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 600;
                background-color: var(--status-badge-bg);
                color: white;
            }

            .footer {
                text-align: center;
                padding: 1.5rem;
                color: #6b7280;
                font-size: 0.875rem;
                margin-top: 2rem;
                border-top: 1px solid #e5e7eb;
            }

            .footer a {
                color: var(--link-color);
                text-decoration: none;
            }

            .footer a:hover {
                text-decoration: underline;
            }

            @media (max-width: 768px) {
                .header-card {
                    padding: 1.5rem;
                }

                .header-card h1 {
                    font-size: 2rem;
                }

                th, td {
                    padding: 0.75rem;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <header class="header-card animate__animated animate__fadeInDown">
                <h1>API Proxy Service</h1>
                <p>安全可靠的 API 代理服务</p>
            </header>

            <main class="table-container animate__animated animate__fadeIn" style="animation-delay: 0.2s;">
                <table>
                    <thead>
                        <tr>
                            <th>代理地址</th>
                            <th>源地址</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </main>

            <footer class="footer">
                Created by
                <a href="https://jxufe.icu/u/piter/summary" target="_blank" rel="noopener noreferrer">
                    piter
                </a>
                |
                本站由
                <a href="https://jxufe.icu" target="_blank" rel="noopener noreferrer">
                    deno
                </a>
                赞助
            </footer>
        </div>

        <script>
            function copyText(text, buttonElement) {
                if (!navigator.clipboard) {
                    try {
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        textarea.style.position = 'fixed';
                        document.body.appendChild(textarea);
                        textarea.focus();
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        showCopiedFeedback(buttonElement);
                    } catch (err) {
                        console.error('Fallback: Oops, unable to copy', err);
                        alert('复制失败，请手动复制。');
                    }
                    return;
                }
                navigator.clipboard.writeText(text).then(() => {
                    showCopiedFeedback(buttonElement);
                }).catch(err => {
                    console.error('Async: Could not copy text: ', err);
                    alert('复制失败，请检查浏览器权限或手动复制。');
                });
            }

            function showCopiedFeedback(buttonElement) {
                const originalIcon = buttonElement.innerHTML;
                buttonElement.innerHTML = '<i class="fas fa-check"></i>';
                buttonElement.classList.add('copied');
                buttonElement.disabled = true;

                setTimeout(() => {
                    buttonElement.innerHTML = originalIcon;
                    buttonElement.classList.remove('copied');
                    buttonElement.disabled = false;
                }, 1200);
            }
        </script>
    </body>
    </html>
    `;

  return new Response(htmlContent, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function serveStaticFile(request: Request, filepath: string): Promise<Response> {
  try {
    const resolvedPath = Deno.realPathSync(filepath);
    const projectRoot = Deno.realPathSync(".");
    if (!resolvedPath.startsWith(projectRoot)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = await Deno.open(resolvedPath, { read: true });
    const stat = await file.stat();

    if (stat.isDirectory) {
      file.close();
      return new Response("Not Found (is directory)", { status: 404 });
    }

    return await serveFile(request, resolvedPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    } else {
      console.error("Error serving static file:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}

// --- Start the Server ---
console.log(`服务器正在启动... ${new Date().toISOString()}`);
console.log(`将在端口 ${PROXY_PORT} 上监听`);
console.log(`代理域名设置为: ${PROXY_DOMAIN}`);
console.warn(
  `请通过 HTTPS 访问: https://${PROXY_DOMAIN}/ (假设端口 443 由反向代理处理)`
);
console.log("可用代理路径:");
Object.keys(apiMapping)
  .sort()
  .forEach((p) =>
    console.log(`  - https://${PROXY_DOMAIN}${p} -> ${apiMapping[p]}`)
  );

serve(
  async (req) => {
    try {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      const response = await main(req);
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.url} - ${response.status}`
      );
      return response;
    } catch (e) {
      console.error("未捕获的错误:", e);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  { port: parseInt(PROXY_PORT, 10) }
);
