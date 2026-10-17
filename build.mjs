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
// Optional keys: "image" (share image), "mainClass", and for posts "date" and "category".
//
// Images: any <img> under /assets/img/ that has -400/-800 copies next to it
// (made by scripts/make-sizes.py) gets a srcset automatically.

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

const base = config.url.replace(/\/$/, "");
const imgRoot = join(root, "assets/img");

// Adds srcset to images that have resized copies, and a default sizes value.
function responsive(html) {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const src = tag.match(/\ssrc="(\/assets\/img\/[^"]+)\.webp"/);
    const w = tag.match(/\swidth="(\d+)"/);
    if (!src || !w || /\ssrcset=/.test(tag)) return tag;
    const file = (n) => join(root, `${src[1]}-${n}.webp`);
    const set = [400, 800].filter((n) => existsSync(file(n))).map((n) => `${src[1]}-${n}.webp ${n}w`);
    if (!set.length) return tag;
    set.push(`${src[1]}.webp ${w[1]}w`);
    const sizes = /\ssizes=/.test(tag) ? "" : ' sizes="(max-width: 760px) 100vw, 760px"';
    return tag.replace(/<img\b/, `<img srcset="${set.join(", ")}"${sizes}`);
  });
}

const absolute = (path) => (path.startsWith("http") ? path : base + path);
const shareImage = (path) => {
  const smaller = path.replace(/\.webp$/, "-800.webp");
  return absolute(existsSync(join(root, smaller)) ? smaller : path);
};

const person = {
  "@type": "Person",
  "@id": `${base}/#artist`,
  name: config.name,
  url: base + "/",
  jobTitle: "Artist and designer",
  sameAs: config.social.map((s) => s.href),
};

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
    mainClass: meta.mainClass || "",
    image: shareImage(meta.image || config.image),
    jsonld: JSON.stringify(meta.jsonld ? [person, ...meta.jsonld] : person).replaceAll("<", "\\u003c"),
  };
  const content = body.replaceAll("{{formKey}}", config.formKey).replaceAll("{{email}}", config.email);
  let html = layout.replace("{{content}}", () => content);
  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(`{{${k}}}`, ["nav", "social", "jsonld"].includes(k) ? v : esc(v));
  }
  return responsive(html);
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
  new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });

// "Pinstripe Playing Cards - The Seal" -> series "Pinstripe Playing Cards", short title "The Seal",
// when more than one post shares the prefix.
const prefix = (t) => (t.includes(" - ") ? t.slice(0, t.indexOf(" - ")) : null);
const prefixCount = {};
for (const p of posts) {
  const pre = prefix(p.meta.title);
  if (pre) prefixCount[pre] = (prefixCount[pre] || 0) + 1;
}
for (const p of posts) {
  const pre = prefix(p.meta.title);
  p.series = pre && prefixCount[pre] > 1 ? pre : null;
  p.short = p.series ? p.meta.title.slice(pre.length + 3) : p.meta.title;
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

posts.forEach((p, i) => {
  const urlPath = `/blog/${p.slug}/`;
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const body = `
<article class="post">
  <header class="page-intro">
    <p class="eyebrow"><a href="/blog/">Blog</a>${p.series ? ` · ${esc(p.series)}` : ""}</p>
    <h1>${esc(p.short)}</h1>
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
  // Posts about a single piece open with its medium and size; describe the piece for search engines.
  const artwork = /^(Acrylic|\d)/.test(p.meta.description || "") && p.meta.image;
  const jsonld = [
    {
      "@type": "BlogPosting",
      headline: p.meta.title,
      datePublished: p.meta.date,
      image: shareImage(p.meta.image || config.image),
      author: { "@id": person["@id"] },
      url: base + urlPath,
    },
  ];
  if (artwork) {
    jsonld.push({
      "@type": "VisualArtwork",
      name: p.meta.title,
      description: p.meta.description,
      image: shareImage(p.meta.image),
      creator: { "@id": person["@id"] },
      url: base + urlPath,
    });
  }
  write(urlPath, render(urlPath, { ...p.meta, jsonld }, body));
  urls.push(urlPath);
});

const cards = posts
  .map(
    (p) => `
    <li class="post-card" data-category="${slugify(p.meta.category || "")}">
      <a href="/blog/${p.slug}/">
        ${p.meta.image ? `<img src="${p.meta.image}" alt="" loading="lazy" width="600" height="400" sizes="(max-width: 700px) 100vw, 400px">` : ""}
        <div>
          <p class="post-meta">${p.series ? `<span class="series">${esc(p.series)}</span> · ` : ""}<time datetime="${p.meta.date}">${fmtDate(p.meta.date)}</time></p>
          <h2>${esc(p.short)}</h2>
        </div>
      </a>
    </li>`
  )
  .join("");
const order = ["Paintings", "Playing cards", "Shoes", "News"];
const categories = [...new Set(posts.map((p) => p.meta.category).filter(Boolean))].sort(
  (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)
);
const filters = `
<div class="filters wide" role="group" aria-label="Show posts about" hidden>
  <button type="button" aria-pressed="true" data-filter="all">All</button>
  ${categories.map((c) => `<button type="button" aria-pressed="false" data-filter="${slugify(c)}">${esc(c)}</button>`).join("\n  ")}
</div>`;
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
${filters}
<ul class="post-list wide" data-filterable>${cards}
</ul>`
  )
);
urls.push("/blog/");

writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${base}${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`
);

console.log(`Built ${urls.length} pages into dist/`);
