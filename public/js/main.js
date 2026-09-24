// ---------- color tokens used by product/crew cards ----------
const GRADIENTS = {
  orange: "linear-gradient(150deg, var(--orange), #7a2c0e)",
  dark: "linear-gradient(150deg, #2b2932, #17161a)",
  purple: "linear-gradient(150deg, var(--purple), #3a1770)",
  blue: "linear-gradient(160deg, #4a3ad8, #1f1740)",
};
const CREW_GRADIENTS = {
  orange: "linear-gradient(160deg, var(--orange), #7a2c0e)",
  purple: "linear-gradient(160deg, var(--purple), #3a1770)",
  blue: "linear-gradient(160deg, #4a3ad8, #1f1740)",
};

const SHIRT_SVG = (fill) => `
  <svg viewBox="0 0 100 100"><path d="M30 20 L40 12 L50 20 L60 12 L70 20 L70 35 L62 32 L62 85 L38 85 L38 32 L30 35 Z" fill="${fill}" opacity="0.9"/></svg>
`;
const DANCER_SVG = (stroke, fill) => `
  <svg viewBox="0 0 200 260"><g stroke="${stroke}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.78">
    <path d="M100 60 L88 110 L115 145 L88 195"/>
    <path d="M115 145 L152 138"/>
    <circle cx="100" cy="42" r="15" fill="${fill}" stroke="none"/>
  </g></svg>
`;

function escapeHtml(str) {
  return String(str || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function fmtMoney(n) {
  return `KES ${Number(n).toLocaleString("en-KE")}`;
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return { month: "", day: "", year: "" };
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: d.getDate(),
    year: d.getFullYear(),
  };
}

async function loadProducts() {
  const grid = document.getElementById("merchGrid");
  if (!grid) return;
  try {
    const res = await fetch("/api/products");
    const products = await res.json();
    const filledProducts = products.filter((p) => {
      const hasName = Boolean((p.name || "").trim());
      const hasImage = Boolean((p.image || "").trim());
      return hasName || hasImage;
    });
    const isHomePage = ["/", "/index.html"].includes(window.location.pathname);
    const visibleProducts = isHomePage ? filledProducts.slice(0, 3) : filledProducts;
    grid.innerHTML = visibleProducts
      .map(
        (p) => `
      <div class="product">
        <div class="product-art" style="background:${GRADIENTS[p.color] || GRADIENTS.dark};">
          ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" />` : SHIRT_SVG(p.color === "dark" ? "#f4f1ec" : "#161316")}
        </div>
        <div class="product-body">
          <h3>${escapeHtml(p.name)}</h3>
          <p class="desc">${escapeHtml(p.description)}</p>
          <p class="product-price">${fmtMoney(p.price)}</p>
          <div class="product-controls">
            <select aria-label="Select size" data-size-for="${p.id}">
              ${p.sizes
                .map((s) => {
                  const stock =
                    p.stock && Number.isInteger(p.stock[s]) ? p.stock[s] : 0;
                  return `<option value="${escapeHtml(s)}" ${stock < 1 ? "disabled" : ""}>Size — ${escapeHtml(s)}${stock < 1 ? " — Sold out" : ""}</option>`;
                })
                .join("")}
            </select>
            <button class="add-btn" data-add-product="${p.id}" ${p.sizes.every((s) => !(p.stock && p.stock[s] > 0)) ? "disabled" : ""}>${p.sizes.every((s) => !(p.stock && p.stock[s] > 0)) ? "Sold Out" : "Add To Cart"}</button>
          </div>
        </div>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    grid.innerHTML =
      '<p style="color:var(--text-faint)">Could not load products right now.</p>';
  }
}

async function loadCrew() {
  const grid = document.getElementById("crewGrid");
  if (!grid) return;
  try {
    const res = await fetch("/api/crew");
    const crew = await res.json();
    const filledCrew = crew.filter((c) => {
      const hasName = Boolean((c.name || "").trim());
      const hasImage = Boolean((c.image || "").trim());
      return hasName || hasImage;
    });
    grid.innerHTML = filledCrew
      .map((c) => {
        const visual = c.image
          ? `<img class="crew-photo" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" loading="lazy" />`
          : DANCER_SVG(
              c.color === "blue" ? "#f4f1ec" : "#161316",
              c.color === "blue" ? "#f4f1ec" : "#161316",
            );

        return `
            <div class="crew-card" tabindex="0">
              <div class="bg ${c.image ? "has-image" : ""}" style="background:${CREW_GRADIENTS[c.color] || CREW_GRADIENTS.orange};">
                ${visual}
              </div>
              <div class="info">
                <h3>${escapeHtml(c.name)}</h3>
                <p class="role">${escapeHtml(c.role)}</p>
              </div>
            </div>
          `;
      })
      .join("");
  } catch (err) {
    grid.innerHTML =
      '<p style="color:var(--text-faint)">Could not load the crew right now.</p>';
  }
}

async function loadShows() {
  const list = document.getElementById("showList");
  if (!list) return;
  try {
    const res = await fetch("/api/shows");
    const shows = await res.json();
    if (shows.length === 0) {
      list.innerHTML =
        '<p style="color:var(--text-faint); padding:24px 0;">No upcoming shows right now — check back soon.</p>';
      return;
    }
    list.innerHTML = shows
      .map((s) => {
        const { month, day, year } = fmtDate(s.date);
        return `
        <div class="show-row">
          <div class="show-date">${month} ${day}<small>${year}</small></div>
          <div class="show-name"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description || "")}</p></div>
          <div class="show-venue">${escapeHtml(s.venue)}</div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    list.innerHTML =
      '<p style="color:var(--text-faint); padding:24px 0;">Could not load the schedule right now.</p>';
  }
}

function getVideoEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }
    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.match(/\/shorts\/([^/]+)/)?.[1];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }
    if (url.hostname.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : "";
    }
  } catch (err) {
    return "";
  }
  return "";
}

async function loadVideos() {
  const grid = document.getElementById("videoGrid");
  if (!grid) return;
  try {
    const res = await fetch("/api/videos");
    const videos = await res.json();
    const validVideos = videos.filter((video) => video.title && getVideoEmbedUrl(video.url));
    if (validVideos.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-faint); padding:24px 0;">Videos will appear here soon.</p>';
      return;
    }
    grid.innerHTML = validVideos.map((video) => `
      <article class="video-card">
        <div class="video-frame">
          <iframe src="${getVideoEmbedUrl(video.url)}" title="${escapeHtml(video.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        </div>
        <div class="video-card-body">
          <h3>${escapeHtml(video.title)}</h3>
          ${video.description ? `<p>${escapeHtml(video.description)}</p>` : ""}
        </div>
      </article>
    `).join("");
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--text-faint); padding:24px 0;">Could not load videos right now.</p>';
  }
}

async function loadPageImages() {
  const targets = document.querySelectorAll("[data-page-image]");
  if (!targets.length) return;
  try {
    const res = await fetch("/api/page-images");
    const images = await res.json();
    targets.forEach((target) => {
      const image = images[target.dataset.pageImage];
      if (!image) return;
      target.style.backgroundImage = `linear-gradient(rgba(10, 9, 12, 0.18), rgba(10, 9, 12, 0.18)), url("${image}")`;
      target.classList.add("has-page-image");
    });
  } catch (err) {
    // Keep the designed gradient/illustration when no image is available.
  }
}

// ---------- nav ----------
function setupNav() {
  const navToggle = document.getElementById("navToggle");
  const navList = document.getElementById("navList");
  if (!navToggle || !navList) return;
  navToggle.addEventListener("click", () => navList.classList.toggle("open"));
  navList
    .querySelectorAll("a")
    .forEach((a) =>
      a.addEventListener("click", () => navList.classList.remove("open")),
    );

  const sections = document.querySelectorAll("section[id]");
  const links = document.querySelectorAll("nav a");
  const setActive = () => {
    let current = sections[0] && sections[0].id;
    sections.forEach((sec) => {
      if (window.scrollY + 140 >= sec.offsetTop) current = sec.id;
    });
    links.forEach((l) =>
      l.classList.toggle("active", l.getAttribute("href") === "#" + current),
    );
  };
  window.addEventListener("scroll", setActive);
  setActive();
}

// ---------- booking form ----------
function setupBookingForm() {
  const form = document.getElementById("bookingForm");
  if (!form) return;
  const btn = document.getElementById("bookingSubmitBtn");
  const msg = document.getElementById("bookingMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    msg.className = "form-msg";
    btn.disabled = true;
    btn.textContent = "Sending…";

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong.");
      }
      msg.textContent = "Thanks — we'll be in touch within 48 hours.";
      msg.classList.add("ok");
      form.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add("err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Request";
    }
  });
}

// ---------- checkout result banner ----------
function setupCheckoutBanner() {
  const banner = document.getElementById("topBanner");
  const params = new URLSearchParams(window.location.search);
  const status = params.get("checkout");
  if (!status) return;

  const close = () => {
    banner.classList.remove("show");
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", url);
  };

  if (status === "success") {
    banner.className = "top-banner ok show";
    banner.innerHTML =
      'Payment received — thanks for the order! <button id="bannerClose">Dismiss</button>';
    if (window.MotionTribeCart) window.MotionTribeCart.clear();
  } else if (status === "cancel") {
    banner.className = "top-banner err show";
    banner.innerHTML =
      'Checkout cancelled — your cart is still saved. <button id="bannerClose">Dismiss</button>';
  } else {
    return;
  }
  document.getElementById("bannerClose").addEventListener("click", close);
}

document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupBookingForm();
  loadProducts().then(() => {
    if (window.MotionTribeCart) window.MotionTribeCart.bindAddButtons();
  });
  loadCrew();
  loadShows();
  loadVideos();
  loadPageImages();
  setupCheckoutBanner();
});
