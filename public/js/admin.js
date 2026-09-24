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

async function api(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/* ============ auth / shell ============ */

async function checkSession() {
  const { loggedIn } = await api("/session");
  document.getElementById("loginShell").style.display = loggedIn
    ? "none"
    : "block";
  document.getElementById("dashboard").style.display = loggedIn
    ? "block"
    : "none";
  if (loggedIn) loadEverything();
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("loginPassword").value;
  const msg = document.getElementById("loginMsg");
  msg.textContent = "";
  try {
    await api("/login", { method: "POST", body: JSON.stringify({ password }) });
    document.getElementById("loginPassword").value = "";
    checkSession();
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  checkSession();
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

function loadEverything() {
  loadBookings();
  loadOrders();
  loadProducts();
  loadCrew();
  loadShows();
  loadVideos();
  loadPageImages();
}

/* ============ bookings ============ */

async function loadBookings() {
  const body = document.getElementById("bookingsBody");
  const bookings = await api("/bookings");
  if (bookings.length === 0) {
    body.innerHTML =
      '<tr class="empty-row"><td colspan="5">No inquiries yet.</td></tr>';
    return;
  }
  body.innerHTML = bookings
    .map(
      (b) => `
    <tr>
      <td>${new Date(b.createdAt).toLocaleString()}</td>
      <td><strong>${escapeHtml(b.name)}</strong><br><span style="color:var(--text-faint)">${escapeHtml(b.email)}</span></td>
      <td>
        ${escapeHtml(b.service)}${b.budget ? " · " + escapeHtml(b.budget) : ""}${b.date ? " · " + escapeHtml(b.date) : ""}
        ${b.message ? `<br><span style="color:var(--text-faint)">${escapeHtml(b.message)}</span>` : ""}
      </td>
      <td>
        <select data-booking-status="${b.id}">
          ${["new", "contacted", "booked", "closed"].map((s) => `<option value="${s}" ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="actions"><button class="danger" data-booking-delete="${b.id}">Delete</button></td>
    </tr>
  `,
    )
    .join("");
}

document
  .getElementById("bookingsBody")
  .addEventListener("change", async (e) => {
    const select = e.target.closest("[data-booking-status]");
    if (!select) return;
    await api(`/bookings/${select.getAttribute("data-booking-status")}`, {
      method: "PUT",
      body: JSON.stringify({ status: select.value }),
    });
  });

document.getElementById("bookingsBody").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-booking-delete]");
  if (!del) return;
  if (!confirm("Delete this inquiry?")) return;
  await api(`/bookings/${del.getAttribute("data-booking-delete")}`, {
    method: "DELETE",
  });
  loadBookings();
});

/* ============ orders ============ */

async function loadOrders() {
  const body = document.getElementById("ordersBody");
  const orders = await api("/orders");
  if (orders.length === 0) {
    body.innerHTML =
      '<tr class="empty-row"><td colspan="4">No paid orders yet.</td></tr>';
    return;
  }
  body.innerHTML = orders
    .map(
      (o) => `
    <tr>
      <td>${new Date(o.createdAt).toLocaleString()}</td>
      <td>${escapeHtml(o.email || "—")}</td>
      <td>${o.items.map((i) => `${escapeHtml(i.productId)} (${escapeHtml(i.size)}) ×${i.qty}`).join("<br>")}</td>
      <td>KES ${((o.amountTotal || 0) / 100).toLocaleString("en-KE")}</td>
    </tr>
  `,
    )
    .join("");
}

/* ============ generic CRUD tab wiring ============ */
// Reduces the near-identical Products / Crew / Shows forms to one function.
function setupCrudTab({
  endpoint,
  controlPrefix = endpoint,
  formId,
  idField,
  fields,
  tableBody,
  renderRow,
  resetExtra,
}) {
  const form = document.getElementById(formId);
  const idInput = document.getElementById(idField);
  const msg = document.getElementById(`${controlPrefix}Msg`);
  const submitBtn = document.getElementById(`${controlPrefix}SubmitBtn`);
  const cancelBtn = document.getElementById(`${controlPrefix}CancelBtn`);
  const formTitle = document.getElementById(`${controlPrefix}FormTitle`);

  function readForm() {
    const out = {};
    for (const f of fields) out[f.key] = f.read();
    return out;
  }

  function resetForm() {
    idInput.value = "";
    form.reset();
    if (resetExtra) resetExtra();
    submitBtn.textContent = submitBtn.dataset.addLabel;
    cancelBtn.style.display = "none";
    formTitle.textContent = formTitle.dataset.addTitle;
  }

  cancelBtn.addEventListener("click", resetForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    msg.className = "msg";
    try {
      const payload = readForm();
      if (idInput.value) {
        await api(`/${endpoint}/${idInput.value}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api(`/${endpoint}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      msg.textContent = "Saved.";
      msg.classList.add("ok");
      reload();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add("err");
    }
  });

  async function reload() {
    const items = await api(`/${endpoint}`);
    const body = document.getElementById(tableBody);
    if (items.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="10">Nothing here yet.</td></tr>`;
      return;
    }
    body.innerHTML = items.map((item) => renderRow(item)).join("");
  }

  document.getElementById(tableBody).addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-delete]");
    if (editBtn) {
      const items = await api(`/${endpoint}`);
      const item = items.find(
        (i) => i.id === editBtn.getAttribute("data-edit"),
      );
      if (!item) return;
      idInput.value = item.id;
      for (const f of fields) f.write(item);
      submitBtn.textContent = "Save changes";
      cancelBtn.style.display = "inline-block";
      formTitle.textContent = "Edit " + (formTitle.dataset.itemLabel || "item");
      window.scrollTo({
        top: form.getBoundingClientRect().top + window.scrollY - 100,
        behavior: "smooth",
      });
    }
    if (delBtn) {
      if (!confirm("Delete this? This cannot be undone.")) return;
      await api(`/${endpoint}/${delBtn.getAttribute("data-delete")}`, {
        method: "DELETE",
      });
      reload();
    }
  });

  return { reload };
}

/* ---- Products (7-slot merchant management) ---- */
let merchSlotCount = 7;

function setMerchMessage(text = "", type = "") {
  const msg = document.getElementById("productMsg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = text ? `msg ${type || ""}`.trim() : "msg";
}

async function uploadMerchImage(file) {
  const form = new FormData();
  form.append("image", file);

  const res = await fetch("/api/admin/upload-image", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
  return body.url;
}

async function handleImageFileInput(fileInput, index, slotSelector) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const imageUrl = await uploadMerchImage(file);
  const slot = document.querySelector(`${slotSelector}[data-crew-slot-index="${index}"]`);
  if (!slot) return;
  const preview = slot.querySelector(`[data-crew-preview="${index}"]`);
  const imgValue = slot.querySelector(`[data-crew-image-value="${index}"]`);
  if (preview) {
    preview.src = imageUrl;
    preview.style.display = "block";
  }
  if (imgValue) imgValue.value = imageUrl;
}

function renderMerchSlots(items) {
  const grid = document.getElementById("merchSlotsGrid");
  if (!grid) return;

  const defaultSizes = ["S", "M", "L", "XL"];
  const totalSlots = Math.max(merchSlotCount, items.length, 1);

  const cards = Array.from({ length: totalSlots }, (_, index) => {
    const product = items[index] || null;
    const isFeatured = index < 3;
    const stock = product && product.stock ? product.stock : {};
    const sizes = product && Array.isArray(product.sizes) && product.sizes.length
      ? product.sizes
      : defaultSizes;

    const stockFields = defaultSizes
      .map(
        (size) => `
          <label>
            ${size}
            <input type="number" min="0" step="1" value="${Number(stock[size] || 0)}" data-slot-stock-size="${size}" data-slot-index="${index}"/>
          </label>
        `,
      )
      .join("");

    return `
      <div class="merch-slot-card ${isFeatured ? "featured" : ""}" data-slot-index="${index}">
        <div class="slot-header">
          <span>${isFeatured ? "Featured slot" : "Slot ${index + 1}"}</span>
          <button type="button" class="slot-remove" data-slot-remove="${index}">Remove</button>
          <button type="button" class="slot-clear" data-slot-clear="${index}">Clear</button>
        </div>
        <label>
          Shirt name
          <input type="text" value="${escapeHtml(product ? product.name : "")}" data-slot-name="${index}" placeholder="Thunderz Tee" />
        </label>
        <label>
          Price (KES)
          <input type="number" min="0" step="1" value="${Number(product ? product.price : 0)}" data-slot-price="${index}" />
        </label>
        <div class="slot-image-box">
          <img
            src="${product && product.image ? escapeHtml(product.image) : ""}"
            alt="Merch preview"
            data-slot-preview="${index}"
            ${product && product.image ? "" : "style=\"display:none\""}
          />
          <input type="hidden" data-slot-image-value="${index}" value="${escapeHtml(product && product.image ? product.image : "")}" />
          <button type="button" class="slot-upload" data-slot-upload="${index}">Choose image</button>
          <input type="file" accept="image/*" data-slot-file="${index}" hidden />
        </div>
        <label>
          Sizes
          <input type="text" value="${escapeHtml(sizes.join(", "))}" data-slot-sizes="${index}" placeholder="S, M, L, XL" />
        </label>
        <div class="stock-grid">${stockFields}</div>
        <button type="button" class="primary full" data-slot-save="${index}" data-product-id="${product ? product.id : ""}">
          ${product ? "Save changes" : "Add shirt"}
        </button>
      </div>
    `;
  }).join("");

  grid.innerHTML = cards;
}

async function loadMerchSlots({ keepMessage = false, message = "" } = {}) {
  try {
    const items = await api("/products");
    merchSlotCount = Math.max(1, merchSlotCount, items.length);
    renderMerchSlots(items);
    if (message) {
      setMerchMessage(message, "ok");
      return;
    }
    if (!keepMessage) {
      setMerchMessage();
    }
  } catch (err) {
    setMerchMessage(err.message, "err");
  }
}

async function saveMerchSlot(slotIndex, productId) {
  const slot = document.querySelector(`[data-slot-index="${slotIndex}"]`);
  if (!slot) return false;

  const name = slot.querySelector('[data-slot-name="' + slotIndex + '"]').value.trim();
  const price = Number(slot.querySelector('[data-slot-price="' + slotIndex + '"]').value || 0);
  const image = (slot.querySelector('[data-slot-image-value="' + slotIndex + '"]')?.value || "").trim();
  const sizeInput = slot.querySelector('[data-slot-sizes="' + slotIndex + '"]').value;
  const sizes = Array.from(
    new Set(
      (sizeInput || "S, M, L, XL")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

  const stock = {};
  for (const size of ["S", "M", "L", "XL"]) {
    const value = Number(
      slot.querySelector('[data-slot-stock-size="' + size + '"][data-slot-index="' + slotIndex + '"]').value || 0,
    );
    stock[size] = value;
  }

  const payload = {
    name,
    price,
    image: image || "",
    sizes: sizes.length ? sizes : ["S", "M", "L", "XL"],
    color: "orange",
    stock,
    description: "",
  };

  try {
    if (productId) {
      await api(`/products/${productId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      if (!name) {
        throw new Error("Add a shirt name before saving this slot.");
      }
      await api("/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    return true;
  } catch (err) {
    setMerchMessage(err.message, "err");
    return false;
  }
}

async function removeMerchSlot(productId) {
  if (!productId || !confirm("Remove this shirt slot?")) return;
  const msg = document.getElementById("productMsg");
  try {
    await api(`/products/${productId}`, { method: "DELETE" });
    await loadMerchSlots({ keepMessage: true, message: "Saved." });
  } catch (err) {
    setMerchMessage(err.message, "err");
  }
}

const merchGrid = document.getElementById("merchSlotsGrid");
if (merchGrid) {
  merchGrid.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest("[data-slot-save]");
    const removeBtn = e.target.closest("[data-slot-remove]");
    const clearBtn = e.target.closest("[data-slot-clear]");
    const uploadBtn = e.target.closest("[data-slot-upload]");

    if (removeBtn) {
      const index = Number(removeBtn.getAttribute("data-slot-remove"));
      const slot = document.querySelector(`[data-slot-index="${index}"]`);
      const productId = slot ? slot.querySelector("[data-slot-save]")?.getAttribute("data-product-id") || "" : "";
      const name = slot ? slot.querySelector('[data-slot-name="' + index + '"]').value.trim() : "";
      const imageValue = slot ? slot.querySelector('[data-slot-image-value="' + index + '"]').value.trim() : "";
      const hasData = Boolean(productId || name || imageValue);

      if (!confirm(hasData ? "Remove this shirt slot from the site?" : "Remove this empty slot?")) return;

      try {
        if (productId) {
          await api(`/products/${productId}`, { method: "DELETE" });
        }
        merchSlotCount = Math.max(1, merchSlotCount - 1);
        await loadMerchSlots({ keepMessage: true, message: hasData ? "Removed." : "Empty slot removed." });
      } catch (err) {
        setMerchMessage(err.message, "err");
      }
      return;
    }

    if (saveBtn) {
      const saved = await saveMerchSlot(
        Number(saveBtn.getAttribute("data-slot-save")),
        saveBtn.getAttribute("data-product-id") || "",
      );
      if (saved) {
        await loadMerchSlots({ keepMessage: true, message: "Saved." });
      }
    }

    if (clearBtn) {
      const index = Number(clearBtn.getAttribute("data-slot-clear"));
      const slot = document.querySelector(`[data-slot-index="${index}"]`);
      if (slot) {
        slot.querySelector('[data-slot-name="' + index + '"]').value = "";
        slot.querySelector('[data-slot-price="' + index + '"]').value = "0";
        slot.querySelector('[data-slot-image-value="' + index + '"]').value = "";
        const preview = slot.querySelector('[data-slot-preview="' + index + '"]');
        if (preview) {
          preview.src = "";
          preview.style.display = "none";
        }
        slot.querySelector('[data-slot-sizes="' + index + '"]').value = "S, M, L, XL";
        ["S", "M", "L", "XL"].forEach((size) => {
          const input = slot.querySelector('[data-slot-stock-size="' + size + '"][data-slot-index="' + index + '"]');
          if (input) input.value = "0";
        });
      }
    }

    if (uploadBtn) {
      const index = Number(uploadBtn.getAttribute("data-slot-upload"));
      const input = document.querySelector(`[data-slot-file="${index}"]`);
      if (input) input.click();
    }
  });

  merchGrid.addEventListener("change", async (e) => {
    const fileInput = e.target.closest("[data-slot-file]");
    if (!fileInput) return;

    const index = Number(fileInput.getAttribute("data-slot-file"));
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const imageUrl = await uploadMerchImage(file);
      const slot = document.querySelector(`[data-slot-index="${index}"]`);
      if (!slot) return;
      const preview = slot.querySelector(`[data-slot-preview="${index}"]`);
      const imgValue = slot.querySelector(`[data-slot-image-value="${index}"]`);
      if (preview) {
        preview.src = imageUrl;
        preview.style.display = "block";
      }
      if (imgValue) imgValue.value = imageUrl;
      const msg = document.getElementById("productMsg");
      if (msg) {
        msg.textContent = "Image uploaded and ready to save.";
        msg.className = "msg ok";
      }
    } catch (err) {
      const msg = document.getElementById("productMsg");
      if (msg) {
        msg.textContent = err.message;
        msg.className = "msg err";
      }
    }
  });
}

const addMerchSlotBtn = document.getElementById("addMerchSlotBtn");
if (addMerchSlotBtn) {
  addMerchSlotBtn.addEventListener("click", () => {
    merchSlotCount += 1;
    loadMerchSlots({ keepMessage: true });
  });
}

const saveMerchSlotsBtn = document.getElementById("saveMerchSlotsBtn");
if (saveMerchSlotsBtn) {
  saveMerchSlotsBtn.addEventListener("click", async () => {
    try {
      const slots = [...document.querySelectorAll("[data-slot-index]")];
      let changed = false;
      for (const slot of slots) {
        const index = Number(slot.getAttribute("data-slot-index"));
        const productId = slot.querySelector("[data-slot-save]")?.getAttribute("data-product-id") || "";
        const name = slot.querySelector('[data-slot-name="' + index + '"]').value.trim();
        const imageValue = slot.querySelector('[data-slot-image-value="' + index + '"]').value.trim();
        if (!name && !imageValue) continue;
        const saved = await saveMerchSlot(index, productId);
        if (saved) changed = true;
      }
      if (changed) {
        await loadMerchSlots({ keepMessage: true, message: "Saved." });
      }
    } catch (err) {
      setMerchMessage(err.message, "err");
    }
  });
}

function loadProducts() {
  loadMerchSlots();
}

/* ---- Crew (7-slot management) ---- */
let crewSlotCount = 7;

function renderCrewSlots(items) {
  const grid = document.getElementById("crewSlotsGrid");
  if (!grid) return;

  const totalSlots = Math.max(crewSlotCount, items.length, 1);
  const cards = Array.from({ length: totalSlots }, (_, index) => {
    const member = items[index] || null;
    const isFeatured = index < 3;

    return `
      <div class="merch-slot-card ${isFeatured ? "featured" : ""}" data-crew-slot-index="${index}">
        <div class="slot-header">
          <span>${isFeatured ? "Featured slot" : "Slot ${index + 1}"}</span>
          <button type="button" class="slot-remove" data-crew-remove="${index}">Remove</button>
          <button type="button" class="slot-clear" data-crew-clear="${index}">Clear</button>
        </div>
        <label>
          Name
          <input type="text" value="${escapeHtml(member ? member.name : "")}" data-crew-name="${index}" placeholder="Alex Vibe" />
        </label>
        <label>
          Role
          <input type="text" value="${escapeHtml(member ? member.role : "")}" data-crew-role="${index}" placeholder="Lead Choreographer" />
        </label>
        <label>
          Card color
          <select data-crew-color="${index}">
            <option value="orange" ${member && member.color === "orange" ? "selected" : ""}>Orange</option>
            <option value="purple" ${member && member.color === "purple" ? "selected" : ""}>Purple</option>
            <option value="blue" ${member && member.color === "blue" ? "selected" : ""}>Blue</option>
          </select>
        </label>
        <div class="slot-image-box">
          <img
            src="${member && member.image ? escapeHtml(member.image) : ""}"
            alt="Crew preview"
            data-crew-preview="${index}"
            ${member && member.image ? "" : "style=\"display:none\""}
          />
          <input type="hidden" data-crew-image-value="${index}" value="${escapeHtml(member && member.image ? member.image : "")}" />
          <button type="button" class="slot-upload" data-crew-upload="${index}">Choose image</button>
          <input type="file" accept="image/*" data-crew-file="${index}" hidden />
        </div>
        <button type="button" class="primary full" data-crew-save="${index}" data-crew-id="${member ? member.id : ""}">
          ${member ? "Save changes" : "Add member"}
        </button>
      </div>
    `;
  }).join("");

  grid.innerHTML = cards;
}

async function loadCrewSlots({ keepMessage = false, message = "" } = {}) {
  const msg = document.getElementById("crewMsg");
  try {
    const items = await api("/crew");
    crewSlotCount = Math.max(1, crewSlotCount, items.length);
    renderCrewSlots(items);
    if (message) {
      if (msg) {
        msg.textContent = message;
        msg.className = "msg ok";
      }
      return;
    }
    if (!keepMessage && msg) {
      msg.textContent = "";
      msg.className = "msg";
    }
  } catch (err) {
    if (msg) {
      msg.textContent = err.message;
      msg.className = "msg err";
    }
  }
}

async function saveCrewSlot(slotIndex, crewId) {
  const slot = document.querySelector(`[data-crew-slot-index="${slotIndex}"]`);
  if (!slot) return false;

  const name = slot.querySelector('[data-crew-name="' + slotIndex + '"]').value.trim();
  const role = slot.querySelector('[data-crew-role="' + slotIndex + '"]').value.trim();
  const color = slot.querySelector('[data-crew-color="' + slotIndex + '"]').value || "orange";
  const image = (slot.querySelector('[data-crew-image-value="' + slotIndex + '"]')?.value || "").trim();

  if (!name && !role && !image) return false;

  const payload = { name, role, color, image: image || "" };
  try {
    if (crewId) {
      await api(`/crew/${crewId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      if (!name || !role) {
        throw new Error("Add both a name and role before saving this slot.");
      }
      await api("/crew", { method: "POST", body: JSON.stringify(payload) });
    }
    return true;
  } catch (err) {
    const msg = document.getElementById("crewMsg");
    if (msg) {
      msg.textContent = err.message;
      msg.className = "msg err";
    }
    return false;
  }
}

const crewGrid = document.getElementById("crewSlotsGrid");
if (crewGrid) {
  crewGrid.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest("[data-crew-save]");
    const removeBtn = e.target.closest("[data-crew-remove]");
    const clearBtn = e.target.closest("[data-crew-clear]");
    const uploadBtn = e.target.closest("[data-crew-upload]");

    if (removeBtn) {
      const index = Number(removeBtn.getAttribute("data-crew-remove"));
      const slot = document.querySelector(`[data-crew-slot-index="${index}"]`);
      const crewId = slot ? slot.querySelector("[data-crew-save]")?.getAttribute("data-crew-id") || "" : "";
      const name = slot ? slot.querySelector('[data-crew-name="' + index + '"]').value.trim() : "";
      const role = slot ? slot.querySelector('[data-crew-role="' + index + '"]').value.trim() : "";
      const imageValue = slot ? slot.querySelector('[data-crew-image-value="' + index + '"]').value.trim() : "";
      const hasData = Boolean(crewId || name || role || imageValue);

      if (!confirm(hasData ? "Remove this crew slot from the site?" : "Remove this empty slot?")) return;

      try {
        if (crewId) {
          await api(`/crew/${crewId}`, { method: "DELETE" });
        }
        crewSlotCount = Math.max(1, crewSlotCount - 1);
        await loadCrewSlots({ keepMessage: true, message: hasData ? "Removed." : "Empty slot removed." });
      } catch (err) {
        const msg = document.getElementById("crewMsg");
        if (msg) {
          msg.textContent = err.message;
          msg.className = "msg err";
        }
      }
      return;
    }

    if (saveBtn) {
      const saved = await saveCrewSlot(
        Number(saveBtn.getAttribute("data-crew-save")),
        saveBtn.getAttribute("data-crew-id") || "",
      );
      if (saved) {
        await loadCrewSlots({ keepMessage: true, message: "Saved." });
      }
    }

    if (clearBtn) {
      const index = Number(clearBtn.getAttribute("data-crew-clear"));
      const slot = document.querySelector(`[data-crew-slot-index="${index}"]`);
      if (slot) {
        slot.querySelector('[data-crew-name="' + index + '"]').value = "";
        slot.querySelector('[data-crew-role="' + index + '"]').value = "";
        slot.querySelector('[data-crew-color="' + index + '"]').value = "orange";
        slot.querySelector('[data-crew-image-value="' + index + '"]').value = "";
        const preview = slot.querySelector('[data-crew-preview="' + index + '"]');
        if (preview) {
          preview.src = "";
          preview.style.display = "none";
        }
      }
    }

    if (uploadBtn) {
      const index = Number(uploadBtn.getAttribute("data-crew-upload"));
      const input = document.querySelector(`[data-crew-file="${index}"]`);
      if (input) input.click();
    }
  });

  crewGrid.addEventListener("change", async (e) => {
    const colorSelect = e.target.closest("[data-crew-color]");
    const fileInput = e.target.closest("[data-crew-file]");

    if (colorSelect) {
      const msg = document.getElementById("crewMsg");
      if (msg) {
        msg.textContent = "Color updated.";
        msg.className = "msg ok";
      }
      return;
    }

    if (fileInput) {
      const index = Number(fileInput.getAttribute("data-crew-file"));
      try {
        await handleImageFileInput(fileInput, index, "[data-crew-slot-index]");
        const msg = document.getElementById("crewMsg");
        if (msg) {
          msg.textContent = "Image uploaded and ready to save.";
          msg.className = "msg ok";
        }
      } catch (err) {
        const msg = document.getElementById("crewMsg");
        if (msg) {
          msg.textContent = err.message;
          msg.className = "msg err";
        }
      }
    }
  });
}

const addCrewSlotBtn = document.getElementById("addCrewSlotBtn");
if (addCrewSlotBtn) {
  addCrewSlotBtn.addEventListener("click", () => {
    crewSlotCount += 1;
    loadCrewSlots({ keepMessage: true });
  });
}

const saveCrewSlotsBtn = document.getElementById("saveCrewSlotsBtn");
if (saveCrewSlotsBtn) {
  saveCrewSlotsBtn.addEventListener("click", async () => {
    try {
      const slots = [...document.querySelectorAll("[data-crew-slot-index]")];
      let changed = false;
      for (const slot of slots) {
        const index = Number(slot.getAttribute("data-crew-slot-index"));
        const crewId = slot.querySelector("[data-crew-save]")?.getAttribute("data-crew-id") || "";
        const name = slot.querySelector('[data-crew-name="' + index + '"]').value.trim();
        const role = slot.querySelector('[data-crew-role="' + index + '"]').value.trim();
        if (!name && !role) continue;
        const saved = await saveCrewSlot(index, crewId);
        if (saved) changed = true;
      }
      if (changed) {
        await loadCrewSlots({ keepMessage: true, message: "Saved." });
      }
    } catch (err) {
      const msg = document.getElementById("crewMsg");
      if (msg) {
        msg.textContent = err.message;
        msg.className = "msg err";
      }
    }
  });
}

function loadCrew() {
  loadCrewSlots();
}

/* ---- Shows ---- */
const showsTab = setupCrudTab({
  endpoint: "shows",
  controlPrefix: "show",
  formId: "showForm",
  idField: "showId",
  tableBody: "showsBody",
  fields: [
    {
      key: "date",
      read: () => document.getElementById("showDate").value,
      write: (i) => (document.getElementById("showDate").value = i.date),
    },
    {
      key: "name",
      read: () => document.getElementById("showName").value,
      write: (i) => (document.getElementById("showName").value = i.name),
    },
    {
      key: "venue",
      read: () => document.getElementById("showVenue").value,
      write: (i) => (document.getElementById("showVenue").value = i.venue),
    },
    {
      key: "description",
      read: () => document.getElementById("showDescription").value,
      write: (i) =>
        (document.getElementById("showDescription").value =
          i.description || ""),
    },
  ],
  renderRow: (s) => `
    <tr>
      <td>${escapeHtml(s.date)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.venue)}</td>
      <td class="actions"><button data-edit="${s.id}">Edit</button><button class="danger" data-delete="${s.id}">Delete</button></td>
    </tr>
  `,
});
document.getElementById("showSubmitBtn").dataset.addLabel = "Add show";
document.getElementById("showFormTitle").dataset.addTitle =
  "Add show / workshop";
document.getElementById("showFormTitle").dataset.itemLabel = "show";

function loadProducts() {
  loadMerchSlots();
}
function loadShows() {
  showsTab.reload();
}

/* ---- Videos / watching reel ---- */
const videosTab = setupCrudTab({
  endpoint: "videos",
  controlPrefix: "video",
  formId: "videoForm",
  idField: "videoId",
  tableBody: "videosBody",
  fields: [
    {
      key: "title",
      read: () => document.getElementById("videoTitle").value.trim(),
      write: (item) => (document.getElementById("videoTitle").value = item.title || ""),
    },
    {
      key: "url",
      read: () => document.getElementById("videoUrl").value.trim(),
      write: (item) => (document.getElementById("videoUrl").value = item.url || ""),
    },
    {
      key: "description",
      read: () => document.getElementById("videoDescription").value.trim(),
      write: (item) => (document.getElementById("videoDescription").value = item.description || ""),
    },
  ],
  renderRow: (video) => `
    <tr>
      <td><strong>${escapeHtml(video.title)}</strong><br><span style="color:var(--text-faint)">${escapeHtml(video.description || "")}</span></td>
      <td><a href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">Open video</a></td>
      <td class="actions"><button data-edit="${video.id}">Edit</button><button class="danger" data-delete="${video.id}">Delete</button></td>
    </tr>
  `,
});
document.getElementById("videoSubmitBtn").dataset.addLabel = "Add video";
document.getElementById("videoFormTitle").dataset.addTitle = "Add reel video";
document.getElementById("videoFormTitle").dataset.itemLabel = "video";
function loadVideos() {
  videosTab.reload();
}

const pageImageSlots = [
  ["home", "Home"],
  ["about", "About"],
  ["crew", "Crew"],
  ["merch", "Merch"],
  ["events", "Events"],
  ["contact", "Contact"],
  ["privacy", "Privacy"],
  ["terms", "Terms"],
  ["404", "404 page"],
];

async function loadPageImages() {
  const grid = document.getElementById("pageImagesGrid");
  if (!grid) return;
  try {
    const images = await api("/page-images");
    grid.innerHTML = pageImageSlots.map(([key, label]) => `
      <div class="page-image-admin-card">
        <h4>${label}</h4>
        <div class="page-image-preview">
          ${images[key] ? `<img src="${images[key]}" alt="${label} page preview" />` : "<span>No picture added</span>"}
        </div>
        <input type="file" accept="image/*" data-page-image-file="${key}" />
        <button type="button" class="danger" data-page-image-remove="${key}" ${images[key] ? "" : "disabled"}>Remove picture</button>
      </div>
    `).join("");
  } catch (err) {
    const msg = document.getElementById("pageImagesMsg");
    if (msg) { msg.textContent = err.message; msg.className = "msg err"; }
  }
}

const pageImagesGrid = document.getElementById("pageImagesGrid");
if (pageImagesGrid) {
  pageImagesGrid.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-page-image-file]");
    if (!input || !input.files[0]) return;
    const msg = document.getElementById("pageImagesMsg");
    const form = new FormData();
    form.append("image", input.files[0]);
    try {
      msg.textContent = "Uploading...";
      msg.className = "msg";
      const res = await fetch(`/api/admin/page-images/${input.dataset.pageImageFile}`, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
      await loadPageImages();
      msg.textContent = "Picture saved to MongoDB.";
      msg.className = "msg ok";
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "msg err";
    }
  });

  pageImagesGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-page-image-remove]");
    if (!button || !confirm("Remove this page picture?")) return;
    try {
      await api(`/page-images/${button.dataset.pageImageRemove}`, { method: "DELETE" });
      await loadPageImages();
      const msg = document.getElementById("pageImagesMsg");
      msg.textContent = "Picture removed.";
      msg.className = "msg ok";
    } catch (err) {
      const msg = document.getElementById("pageImagesMsg");
      msg.textContent = err.message;
      msg.className = "msg err";
    }
  });
}

/* ============ password change ============ */

document
  .getElementById("passwordForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("passwordMsg");
    msg.textContent = "";
    msg.className = "msg";
    try {
      await api("/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: document.getElementById("currentPassword").value,
          newPassword: document.getElementById("newPassword").value,
        }),
      });
      msg.textContent = "Password updated.";
      msg.classList.add("ok");
      document.getElementById("passwordForm").reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add("err");
    }
  });

checkSession();
