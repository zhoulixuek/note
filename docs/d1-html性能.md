# 尽量减少重定向

重定向响应里通常没有页面本身。浏览器拿到 `Location` 后要再请求一次，那一次才是 HTML。每一次跳转至少多一个网络往返，这段算进 TTFB。链式跳转按跳数累加。

多出来的时间取决于地址变了哪一项：

- **改域名**（`https://example.com/page` → `https://www.example.com/page`）：新主机名要再查一次 DNS（没有缓存时），然后新建 TCP 和 TLS，再加一趟请求往返。
- **改协议**（`http://example.com/page` → `https://example.com/page`）：主机名不变，DNS 一般已经有了。端口从 80 换成 443，旧连接用不上，要新的 TCP 和 TLS，再加一趟请求往返。
- **只改路径**（`https://example.com/old` → `https://example.com/new`）：同域名同协议，连接可以复用。多一趟请求往返，DNS、TCP、TLS 不用重做。

换协议和换域名都要重新握手。换域名通常还多一次 DNS，所以更长。只改路径最短，但那一趟请求省不掉。

# 缓存 HTML 响应

HTML 里写着 CSS、JS、图片等子资源的地址。文档一旦被缓存，发布后浏览器仍可能继续用旧 HTML，于是去请求已经过期的子资源。这份副本在用户浏览器里，服务器无法主动清掉，只能等它自己过期。

- **适合长缓存**：对所有人相同、之后也不会改的静态页。`Cache-Control` 设很长的 `max-age`，新鲜期内浏览器直接用本地副本，不再请求。
- **会随发布更新的页面**：用协商缓存：`Cache-Control: no-cache`，再配 `ETag`。每次访问都带 `If-None-Match` 问一次；没变回 `304`，变了回新 HTML。文档很小，这一趟验证便宜。
- **不适合缓存**：按登录用户个性化的页面。涉及安全和内容是否还新，浏览器缓存后无法主动失效，用 `Cache-Control: no-store`。

# 衡量服务器响应时间

TTFB 很大程度取决于托管环境和后端。静态页可以马上返回；动态页要查库、拼页面，服务器计算更多，TTFB 更高。

先甩一个加载动画、再在浏览器里把数据全拉下来，只是把工作从相对稳定的服务器挪到手机、网络各不相同的客户端。用户侧指标通常会变差。能在服务端做完的，就不要推到客户端。

服务端各段耗时用 `Server-Timing` 响应头报出来：

```
Server-Timing: auth;dur=55.5, db;dur=220
```

`auth` 是鉴权 55.5 毫秒，`db` 是数据库 220 毫秒。可以写多段。

浏览器通过导航条目上的 `serverTiming` 读取，不是 `responseStart` 那些时间戳：

```js
const nav = performance.getEntriesByType('navigation')[0];
nav.serverTiming.forEach((m) => console.log(m.name, m.duration));
```

同源页面可以直接读。跨域资源还要服务器带 `Timing-Allow-Origin`，否则 `serverTiming` 是空的。

# 压缩

HTML、JS、CSS、SVG 这类文本响应要压缩后再传输，下载更快。优先用 Brotli，比 gzip 大约小 15% 到 20%，主流浏览器都支持。

小于约 1 KiB 的文件几乎压不动，数据太少，算法找不到可重复的片段。文件越大，压缩率越高，但不要为了好压就交付很大的 JS 或 CSS。解压之后还要解析和执行，体积大就更慢；文件一大，细小改动也会改掉哈希，缓存更容易失效。

- **静态压缩**：提前压好。请求到来时不用再压，不增加服务器响应时间。JS、CSS、SVG 用这种。
- **动态压缩**：请求时再压，有时每次请求都压，会拉高 TTFB。HTML，尤其是按登录用户现生成的 HTML，用这种。

动态压缩 HTML 时需要注意：

1. 尽量把压缩交给 CDN。
2. 自己压的话，Brotli 要选合适的质量。Node 的 `zlib.brotliCompress` 不传参时质量是 11，一份大约 296KB 的 HTML 要 200ms，压缩过程会堵住返回；同样一份 gzip 只要 10–30ms。质量太高，省下的体积会被这段耗时吃掉。
3. 旧浏览器用 gzip 兜底，有压缩就比不压缩好。不用解析 UA。浏览器在 `Accept-Encoding` 里声明能解哪种，例如 `gzip, deflate, br`；有 `br` 回 Brotli，没有就回 gzip。响应带 `Vary: Accept-Encoding`，避免缓存把 Brotli 正文发给不支持的客户端。

# CDN

CDN 是一组分布式服务器。它把源站的资源缓存下来，再从离用户更近的边缘节点送出。距离短，往返时间（RTT）就短。再加上 HTTP/2 或 HTTP/3、缓存和压缩，从边缘节点取内容通常比每次回源站更快。有时能明显降低 TTFB。
