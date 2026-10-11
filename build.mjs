// Builds the static site into dist/. No dependencies: `node build.mjs`.
//
// src/layout.html      shared page shell (header, menu, footer)
// src/pages/*.html     one file per page; dist path mirrors the file name
// src/blog/*.html      one file per post; built to /blog/<slug>/ plus an index
// assets/              copied as-is to dist/assets/
// site.config.json     name, email, social links, form key
//
// Each page or post starts with a JSON front matter block in an HTML comment:
//   <!--- { "title": "...", "description": "..." } --->

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const root = dirname(new URL(import.meta.url).pathname);
const out = join(root, "dist");
const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
const layout = readFileSync(join(root, "src/layout.html"), "utf8");

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function parse(file) {
  const raw = readFileSync(file, "utf8");
  const m = raw.match(/^<!---\s*([\s\S]*?)\s*--->\s*/);
  if (!m) throw new Error(`${file}: missing front matter`);
  return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length) };
}

function nav(current) {
  const items = config.nav
    .map(({ label, href, external }) => {
      const attrs = external ? ' target="_blank" rel="noopener"' : "";
      const active = !external && (current === href || (href !== "/" && current.startsWith(href)));
      return `<li><a href="${href}"${attrs}${active ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`;
    })
    .join("\n          ");
  return items;
}

function socials() {
  return config.social
    .map(({ label, href }) => `<li><a href="${href}" target="_blank" rel="noopener">${esc(label)}</a></li>`)
    .join("\n            ");
}

function render(urlPath, meta, body) {
  const vars = {
    title: meta.title === config.name ? config.name : `${meta.title} | ${config.name}`,
    description: meta.description || config.tagline,
    name: config.name,
    email: config.email,
    nav: nav(urlPath),
    social: socials(),
    year: String(new Date().getFullYear()),
    canonical: config.url.replace(/\/$/, "") + urlPath,
  };
  const content = body.replaceAll("{{formKey}}", config.formKey).replaceAll("{{email}}", config.email);
  let html = layout.replace("{{content}}", () => content);
  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(`{{${k}}}`, ["nav", "social"].includes(k) ? v : esc(v));
  }
  return html;
}

function write(urlPath, html) {
  const file = urlPath.endsWith("/") ? join(out, urlPath, "index.html") : join(out, urlPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "assets"), join(out, "assets"), { recursive: true });
for (const f of ["_redirects", "_headers", "robots.txt"]) {
  if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f));
}

const urls = [];

// Pages: index.html -> /, about.html -> /about/
for (const f of readdirSync(join(root, "src/pages")).filter((f) => f.endsWith(".html"))) {
  const { meta, body } = parse(join(root, "src/pages", f));
  const urlPath = f === "index.html" ? "/" : f === "404.html" ? "/404.html" : `/${basename(f, ".html")}/`;
  write(urlPath, render(urlPath, meta, body));
  if (urlPath !== "/404.html") urls.push(urlPath);
}

// Blog posts, newest first
const posts = readdirSync(join(root, "src/blog"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ slug: basename(f, ".html"), ...parse(join(root, "src/blog", f)) }))
  .sort((a, b) => b.meta.date.localeCompare(a.meta.date));

const fmtDate = (d) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

posts.forEach((p, i) => {
  const urlPath = `/blog/${p.slug}/`;
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const body = `
<article class="post">
  <header class="page-intro">
    <p class="eyebrow"><a href="/blog/">Blog</a></p>
    <h1>${esc(p.meta.title)}</h1>
    <p class="post-meta"><time datetime="${p.meta.date}">${fmtDate(p.meta.date)}</time></p>
  </header>
  <div class="prose">
${p.body}
  </div>
  <nav class="post-nav" aria-label="More posts">
    ${newer ? `<a href="/blog/${newer.slug}/" class="post-nav-newer"><span>Newer</span>${esc(newer.meta.title)}</a>` : "<span></span>"}
    ${older ? `<a href="/blog/${older.slug}/" class="post-nav-older"><span>Older</span>${esc(older.meta.title)}</a>` : "<span></span>"}
  </nav>
</article>`;
  write(urlPath, render(urlPath, p.meta, body));
  urls.push(urlPath);
});

const cards = posts
  .map(
    (p) => `
    <li class="post-card">
      <a href="/blog/${p.slug}/">
        ${p.meta.image ? `<img src="${p.meta.image}" alt="" loading="lazy" width="600" height="400">` : ""}
        <div>
          <h2>${esc(p.meta.title)}</h2>
          <p class="post-meta"><time datetime="${p.meta.date}">${fmtDate(p.meta.date)}</time></p>
          ${p.meta.description ? `<p>${esc(p.meta.description)}</p>` : ""}
        </div>
      </a>
    </li>`
  )
  .join("");
write(
  "/blog/",
  render(
    "/blog/",
    { title: "Blog", description: `Process notes and project posts from ${config.name}.` },
    `
<header class="page-intro">
  <h1>Blog</h1>
  <p class="lede">Process notes on paintings, playing cards, games and custom shoes.</p>
</header>
<ul class="post-list wide">${cards}
</ul>`
  )
);
urls.push("/blog/");

const base = config.url.replace(/\/$/, "");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${base}${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`
);

console.log(`Built ${urls.length} pages into dist/`);
