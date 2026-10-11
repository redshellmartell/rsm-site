// Menu button, tap-to-enlarge galleries, contact form.

document.addEventListener("DOMContentLoaded", () => {
  // Phone menu
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("open", open);
    });
  }

  // Lightbox: every image inside a .gallery or .masonry group, or marked data-zoom
  const groups = document.querySelectorAll(".gallery, .masonry, .prose");
  if (groups.length) {
    const dialog = document.createElement("dialog");
    dialog.className = "lightbox";
    dialog.innerHTML = `
      <div class="lightbox-inner">
        <figure><img alt=""><figcaption class="lightbox-caption"></figcaption></figure>
      </div>
      <button class="lightbox-close" aria-label="Close">&times;</button>
      <button class="lightbox-prev" aria-label="Previous image">&lsaquo;</button>
      <button class="lightbox-next" aria-label="Next image">&rsaquo;</button>`;
    document.body.append(dialog);
    const big = dialog.querySelector("img");
    const caption = dialog.querySelector(".lightbox-caption");
    let set = [];
    let index = 0;

    const show = (i) => {
      index = (i + set.length) % set.length;
      const img = set[index];
      big.src = img.dataset.full || img.currentSrc || img.src;
      big.alt = img.alt;
      const fig = img.closest("figure");
      caption.textContent = fig?.querySelector("figcaption")?.textContent || "";
      const multi = set.length > 1;
      dialog.querySelector(".lightbox-prev").hidden = !multi;
      dialog.querySelector(".lightbox-next").hidden = !multi;
    };

    groups.forEach((group) => {
      const imgs = [...group.querySelectorAll(group.classList.contains("prose") ? "img[data-zoom]" : "img")];
      imgs.forEach((img, i) => {
        img.tabIndex = 0;
        const open = () => { set = imgs; show(i); dialog.showModal(); };
        img.addEventListener("click", open);
        img.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
      });
    });

    dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
    dialog.querySelector(".lightbox-prev").addEventListener("click", () => show(index - 1));
    dialog.querySelector(".lightbox-next").addEventListener("click", () => show(index + 1));
    big.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target.classList.contains("lightbox-inner")) dialog.close(); });
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
  }

  // Contact form (Web3Forms)
  const form = document.querySelector("form.form");
  if (form) {
    const status = form.querySelector(".form-status");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.className = "form-status";
      status.textContent = "Sending…";
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new FormData(form),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Send failed");
        form.reset();
        status.classList.add("ok");
        status.textContent = "Thanks for writing! I'll get back to you soon.";
      } catch {
        status.classList.add("error");
        status.innerHTML = `Sorry, that didn't send. Please email me at <a href="mailto:${form.dataset.email}">${form.dataset.email}</a>.`;
      } finally {
        button.disabled = false;
      }
    });
  }
});
