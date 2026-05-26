const productSeeds = [
  {
    name: "ເສື້ອທີມ Custom Sublimation",
    category: "ເສື້ອກິລາ",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80",
    basePrice: 85000,
  },
  {
    name: "ກາງເກງກິລາ Training",
    category: "ກາງເກງ",
    image: "https://images.unsplash.com/photo-1506629905607-d405d7d3b0d2?auto=format&fit=crop&w=600&q=80",
    basePrice: 65000,
  },
  {
    name: "ຊຸດທີມ Football Full Set",
    category: "ຊຸດທີມ",
    image: "https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=600&q=80",
    basePrice: 145000,
  },
  {
    name: "ເສື້ອ Polo ພິມໂລໂກ້",
    category: "Polo",
    image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=600&q=80",
    basePrice: 95000,
  },
  {
    name: "ເສື້ອວິ່ງ Lightweight",
    category: "Running",
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80",
    basePrice: 78000,
  },
  {
    name: "ໝວກທີມກິລາ",
    category: "ອຸປະກອນ",
    image: "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=600&q=80",
    basePrice: 45000,
  },
  {
    name: "ຖົງຕີນ Football Pro",
    category: "ອຸປະກອນ",
    image: "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?auto=format&fit=crop&w=600&q=80",
    basePrice: 28000,
  },
  {
    name: "ເສື້ອ Basketball Jersey",
    category: "Basketball",
    image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80",
    basePrice: 98000,
  },
];

const colors = ["ແດງ", "ນ້ຳເງິນ", "ດຳ", "ຂາວ", "ເຫຼືອງ", "ຂຽວ", "ສົ້ມ", "ຟ້າ"];
const sizes = ["S-3XL", "M-4XL", "Kids", "Women", "Men", "Free size"];
const cartKey = "kt_sport_cart";
let visibleLimit = 24;
let cart = JSON.parse(localStorage.getItem(cartKey) || "{}");

const currency = (value) =>
  new Intl.NumberFormat("lo-LA", {
    style: "currency",
    currency: "LAK",
    maximumFractionDigits: 0,
  }).format(value);

const products = Array.from({ length: 500 }, (_, index) => {
  const seed = productSeeds[index % productSeeds.length];
  const color = colors[index % colors.length];
  const variant = Math.floor(index / productSeeds.length) + 1;
  const price = seed.basePrice + (variant % 9) * 5000;
  return {
    id: `KT-${String(index + 1).padStart(4, "0")}`,
    name: `${seed.name} ${color} #${variant}`,
    category: seed.category,
    image: seed.image,
    price,
    moq: index % 3 === 0 ? 1 : 6,
    size: sizes[index % sizes.length],
    sold: 1200 - index,
  };
});

function saveCart() {
  localStorage.setItem(cartKey, JSON.stringify(cart));
}

function filteredProducts() {
  const search = document.querySelector("#productSearch").value.trim().toLowerCase();
  const category = document.querySelector("#categoryFilter").value;
  const sort = document.querySelector("#sortFilter").value;
  const filtered = products.filter((product) => {
    const matchesCategory = category === "ALL" || product.category === category;
    const haystack = `${product.name} ${product.category} ${product.id}`.toLowerCase();
    return matchesCategory && (!search || haystack.includes(search));
  });
  return filtered.sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    return b.sold - a.sold;
  });
}

function renderCategories() {
  const select = document.querySelector("#categoryFilter");
  const categories = [...new Set(products.map((product) => product.category))];
  select.innerHTML += categories.map((category) => `<option value="${category}">${category}</option>`).join("");
}

function renderProducts() {
  const list = filteredProducts();
  document.querySelector("#resultCount").textContent = `${list.length} ລາຍການ`;
  document.querySelector("#productTotal").textContent = products.length;
  document.querySelector("#productGrid").innerHTML = list
    .slice(0, visibleLimit)
    .map(
      (product) => `
        <article class="catalog-card">
          <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.src='./assets/kt-sport-logo.jpg'" />
          <div class="catalog-card-body">
            <span>${product.category}</span>
            <h3>${product.name}</h3>
            <p>ໄຊ້: ${product.size} · MOQ ${product.moq}</p>
            <strong>${currency(product.price)}</strong>
            <button type="button" data-add="${product.id}">ໃສ່ກະຕ່າ</button>
          </div>
        </article>
      `,
    )
    .join("");
  document.querySelector("#loadMoreButton").hidden = visibleLimit >= list.length;
}

function renderCart() {
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ ...products.find((product) => product.id === id), qty }))
    .filter((item) => item.id);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.querySelector("#cartCount").textContent = totalQty;
  document.querySelector("#cartTotal").textContent = currency(total);
  document.querySelector("#cartItems").innerHTML =
    items.length === 0
      ? '<p class="empty-state">ກະຕ່າຍັງວ່າງ</p>'
      : items
          .map(
            (item) => `
              <div class="cart-item">
                <img src="${item.image}" alt="${item.name}" onerror="this.src='./assets/kt-sport-logo.jpg'" />
                <div>
                  <strong>${item.name}</strong>
                  <span>${currency(item.price)} x ${item.qty}</span>
                  <div class="qty-controls">
                    <button type="button" data-dec="${item.id}">−</button>
                    <button type="button" data-inc="${item.id}">+</button>
                    <button type="button" data-remove="${item.id}">ລົບ</button>
                  </div>
                </div>
              </div>
            `,
          )
          .join("");
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderCart();
}

function updateQty(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  if (cart[id] === 0) delete cart[id];
  saveCart();
  renderCart();
}

function checkout() {
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ ...products.find((product) => product.id === id), qty }))
    .filter((item) => item.id);
  if (!items.length) return;
  const lines = items.map((item) => `- ${item.id} ${item.name} x${item.qty} = ${currency(item.price * item.qty)}`);
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const text = encodeURIComponent(`ສະບາຍດີ KT SPORT, ຂ້ອຍສົນໃຈສັ່ງສິນຄ້າ:\n${lines.join("\n")}\nລວມ: ${currency(total)}`);
  window.open(`https://wa.me/8562029933696?text=${text}`, "_blank", "noopener");
}

function setupShop() {
  renderCategories();
  renderProducts();
  renderCart();

  document.querySelector("#productSearch").addEventListener("input", () => {
    visibleLimit = 24;
    renderProducts();
  });
  document.querySelector("#categoryFilter").addEventListener("change", () => {
    visibleLimit = 24;
    renderProducts();
  });
  document.querySelector("#sortFilter").addEventListener("change", renderProducts);
  document.querySelector("#loadMoreButton").addEventListener("click", () => {
    visibleLimit += 24;
    renderProducts();
  });
  document.querySelector("#productGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (button) addToCart(button.dataset.add);
  });
  document.querySelector("#cartItems").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.inc) updateQty(button.dataset.inc, 1);
    if (button.dataset.dec) updateQty(button.dataset.dec, -1);
    if (button.dataset.remove) {
      delete cart[button.dataset.remove];
      saveCart();
      renderCart();
    }
  });
  document.querySelector("#checkoutButton").addEventListener("click", checkout);
  document.querySelector("#clearCartButton").addEventListener("click", () => {
    cart = {};
    saveCart();
    renderCart();
  });
}

setupShop();
