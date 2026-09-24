(function () {
  const STORAGE_KEY = "motiontribe_cart_v1";
  let productCache = null;

  function readCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    renderCart();
  }

  function addItem(productId, size) {
    const items = readCart();
    const existing = items.find(
      (i) => i.productId === productId && i.size === size,
    );
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ productId, size, qty: 1 });
    }
    writeCart(items);
    openDrawer();
  }

  function updateQty(productId, size, delta) {
    let items = readCart();
    const item = items.find(
      (i) => i.productId === productId && i.size === size,
    );
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      items = items.filter(
        (i) => !(i.productId === productId && i.size === size),
      );
    }
    writeCart(items);
  }

  function removeItem(productId, size) {
    const items = readCart().filter(
      (i) => !(i.productId === productId && i.size === size),
    );
    writeCart(items);
  }

  function clear() {
    writeCart([]);
  }

  async function getProducts() {
    if (productCache) return productCache;
    const res = await fetch("/api/products");
    productCache = await res.json();
    return productCache;
  }

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

  async function renderCart() {
    const items = readCart();
    const countEl = document.getElementById("cartCount");
    const itemsEl = document.getElementById("cartItems");
    const totalEl = document.getElementById("cartTotal");

    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    countEl.textContent = totalQty;

    if (items.length === 0) {
      itemsEl.innerHTML =
        '<p class="cart-empty">Your cart is empty. Add a tee to get started.</p>';
      totalEl.textContent = "KES 0";
      return;
    }

    const products = await getProducts();
    let total = 0;

    itemsEl.innerHTML = items
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return "";
        const lineTotal = product.price * item.qty;
        total += lineTotal;
        return `
        <div class="cart-item">
          <div class="meta">
            <h4>${escapeHtml(product.name)}</h4>
            <p>Size ${escapeHtml(item.size)}</p>
            <div class="qty-row">
              <button class="qty-btn" data-qty-minus="${product.id}" data-size="${item.size}">−</button>
              <span>${item.qty}</span>
              <button class="qty-btn" data-qty-plus="${product.id}" data-size="${item.size}">+</button>
            </div>
            <button class="remove-btn" data-remove="${product.id}" data-size="${item.size}">Remove</button>
          </div>
          <div class="price">KES ${lineTotal.toLocaleString("en-KE")}</div>
        </div>
      `;
      })
      .join("");

    totalEl.textContent = `KES ${total.toLocaleString("en-KE")}`;
  }

  function openDrawer() {
    document.getElementById("cartDrawer").classList.add("open");
    document.getElementById("cartOverlay").classList.add("open");
  }
  function closeDrawer() {
    document.getElementById("cartDrawer").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
  }

  function bindAddButtons() {
    document.querySelectorAll("[data-add-product]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const productId = btn.getAttribute("data-add-product");
        const select = document.querySelector(`[data-size-for="${productId}"]`);
        const size = select ? select.value : null;
        addItem(productId, size);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const checkoutNote = document.getElementById("checkoutNote");
    const emailField = document.createElement("input");
    emailField.id = "checkoutEmail";
    emailField.type = "email";
    emailField.placeholder = "Email for payment receipt";
    emailField.autocomplete = "email";
    emailField.required = true;
    emailField.style.cssText = "width:100%; margin-bottom:12px;";
    checkoutNote.parentNode.insertBefore(emailField, checkoutNote);

    document
      .getElementById("cartOpenBtn")
      .addEventListener("click", openDrawer);
    document
      .getElementById("cartCloseBtn")
      .addEventListener("click", closeDrawer);
    document
      .getElementById("cartOverlay")
      .addEventListener("click", closeDrawer);

    document.getElementById("cartItems").addEventListener("click", (e) => {
      const plus = e.target.closest("[data-qty-plus]");
      const minus = e.target.closest("[data-qty-minus]");
      const remove = e.target.closest("[data-remove]");
      if (plus)
        updateQty(
          plus.getAttribute("data-qty-plus"),
          plus.getAttribute("data-size"),
          1,
        );
      if (minus)
        updateQty(
          minus.getAttribute("data-qty-minus"),
          minus.getAttribute("data-size"),
          -1,
        );
      if (remove)
        removeItem(
          remove.getAttribute("data-remove"),
          remove.getAttribute("data-size"),
        );
    });

    document
      .getElementById("checkoutBtn")
      .addEventListener("click", async () => {
        const items = readCart();
        const note = document.getElementById("checkoutNote");
        const btn = document.getElementById("checkoutBtn");
        if (items.length === 0) {
          note.textContent = "Add something to your cart first.";
          return;
        }
        const customerEmail = document
          .getElementById("checkoutEmail")
          .value.trim();
        if (!customerEmail) {
          note.textContent = "Enter your email before checkout.";
          document.getElementById("checkoutEmail").focus();
          return;
        }
        btn.disabled = true;
        btn.textContent = "Redirecting to payment…";
        note.textContent = "";
        try {
          const res = await fetch("/api/checkout/create-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items, customerEmail }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || "Checkout failed.");
          window.location.href = body.url;
        } catch (err) {
          note.textContent = err.message;
          btn.disabled = false;
          btn.textContent = "Checkout";
        }
      });

    renderCart();
  });

  window.MotionTribeCart = {
    addItem,
    removeItem,
    updateQty,
    clear,
    bindAddButtons,
  };
})();
