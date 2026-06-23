import {
  db,
  collection,
  addDoc,
  onSnapshot,
  doc,
  serverTimestamp,
  runTransaction
} from "./firebase.js";

const menuItems = [
  {
    name: "Nasi Goreng Pattaya",
    category: "Rice",
    description: "Fried rice wrapped in a soft omelette with chilli sauce.",
    price: "RM 12"
  },
  {
    name: "Nasi Lemak Ayam Goreng",
    category: "Rice",
    description: "Coconut rice, crispy fried chicken, sambal, egg, and peanuts.",
    price: "RM 14"
  },
  {
    name: "Nasi Paprik",
    category: "Rice",
    description: "Steamed rice with spicy paprik chicken and vegetables.",
    price: "RM 13"
  },
  {
    name: "Mee Goreng Mamak",
    category: "Noodles",
    description: "Wok-fried yellow noodles with tofu, egg, and bold mamak spices.",
    price: "RM 11"
  },
  {
    name: "Kuey Teow Goreng",
    category: "Noodles",
    description: "Flat rice noodles stir-fried with egg, vegetables, and savoury sauce.",
    price: "RM 11"
  },
  {
    name: "Char Kuey Teow",
    category: "Noodles",
    description: "Smoky wok-fried noodles with prawns, chives, and bean sprouts.",
    price: "RM 13"
  },
  {
    name: "Satay Ayam",
    category: "Sides",
    description: "Grilled chicken skewers served with peanut sauce and cucumber.",
    price: "RM 10"
  },
  {
    name: "Roti Canai",
    category: "Sides",
    description: "Flaky flatbread served with dhal curry.",
    price: "RM 4"
  },
  {
    name: "Teh Tarik Ais",
    category: "Drinks",
    description: "Pulled milk tea served cold and refreshing.",
    price: "RM 4"
  },
  {
    name: "Sirap Limau",
    category: "Drinks",
    description: "Rose syrup with lime for a bright sweet-tangy finish.",
    price: "RM 4"
  }
];

const orderForm = document.getElementById("orderForm");
const orderStatus = document.getElementById("orderStatus");
const orderNumberText = document.getElementById("orderNumberText");
const orderFoodText = document.getElementById("orderFoodText");
const statusText = document.getElementById("statusText");
const menuGrid = document.getElementById("menuGrid");
const categoryFilters = document.getElementById("categoryFilters");
const selectedItemCard = document.getElementById("selectedItemCard");
const foodNameInput = document.getElementById("foodName");

let currentOrderId = null;
let readyNotified = false;
let selectedCategory = "All";
let selectedItemName = "";

function getOrderDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function getNextDailySequence(orderDateKey) {
  const counterRef = doc(db, "dailyCounters", orderDateKey);

  return runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const lastSequence = counterSnapshot.exists()
      ? Number(counterSnapshot.data().lastSequence || 0)
      : 0;
    const nextSequence = lastSequence + 1;

    transaction.set(
      counterRef,
      {
        lastSequence: nextSequence,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return nextSequence;
  });
}

function renderCategoryFilters() {
  const categories = ["All", ...new Set(menuItems.map((item) => item.category))];

  categoryFilters.innerHTML = categories
    .map(
      (category) => `
        <button
          type="button"
          class="filterChip ${category === selectedCategory ? "active" : ""}"
          data-category="${category}"
        >
          ${category}
        </button>
      `
    )
    .join("");

  categoryFilters.querySelectorAll(".filterChip").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      renderCategoryFilters();
      renderMenuItems();
    });
  });
}

function renderMenuItems() {
  const visibleItems = selectedCategory === "All"
    ? menuItems
    : menuItems.filter((item) => item.category === selectedCategory);

  menuGrid.innerHTML = visibleItems
    .map(
      (item) => `
        <button
          type="button"
          class="menuCard ${item.name === selectedItemName ? "selected" : ""}"
          data-item="${item.name}"
        >
          <span class="menuBadge">${item.category}</span>
          <h3>${item.name}</h3>
          <p>${item.description}</p>
          <div class="menuFooter">
            <span>${item.price}</span>
            <span>Select</span>
          </div>
        </button>
      `
    )
    .join("");

  menuGrid.querySelectorAll(".menuCard").forEach((card) => {
    card.addEventListener("click", () => {
      const clickedItem = menuItems.find((item) => item.name === card.dataset.item);
      selectedItemName = clickedItem.name;
      foodNameInput.value = clickedItem.name;
      renderMenuItems();
      renderSelectedItem(clickedItem);
    });
  });
}

function renderSelectedItem(item) {
  if (!item) {
    selectedItemCard.className = "selectedItemCard empty";
    selectedItemCard.innerHTML = `<p class="selectedPlaceholder">Choose a menu item to see it here.</p>`;
    return;
  }

  selectedItemCard.className = "selectedItemCard";
  selectedItemCard.innerHTML = `
    <div class="selectedTop">
      <span class="menuBadge">${item.category}</span>
      <span class="selectedPrice">${item.price}</span>
    </div>
    <h3>${item.name}</h3>
    <p>${item.description}</p>
  `;
}

orderForm.addEventListener("submit", async function(event) {
  event.preventDefault();

  const tableNo = document.getElementById("tableNo").value.trim();
  const foodName = foodNameInput.value;
  const quantity = document.getElementById("quantity").value;

  if (!foodName) {
    alert("Please choose a menu item before submitting your order.");
    return;
  }

  const orderDateKey = getOrderDateKey();
  const dailySequence = await getNextDailySequence(orderDateKey);

  const orderData = {
    tableNo: tableNo,
    foodName: foodName,
    quantity: Number(quantity),
    status: "Preparing",
    orderDateKey: orderDateKey,
    dailySequence: dailySequence,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, "orders"), orderData);

  currentOrderId = docRef.id;
  readyNotified = false;

  orderStatus.classList.remove("hidden");
  orderNumberText.classList.remove("hidden");
  orderNumberText.textContent = `Order #${dailySequence}`;
  orderFoodText.classList.remove("hidden");
  orderFoodText.textContent = foodName;
  statusText.textContent = "Preparing";
  statusText.className = "statusPill preparingPill";

  listenToOrderStatus(currentOrderId);

  orderForm.reset();
  document.getElementById("quantity").value = 1;
  selectedItemName = "";
  foodNameInput.value = "";
  renderMenuItems();
  renderSelectedItem(null);
}
);

function listenToOrderStatus(orderId) {
  const orderRef = doc(db, "orders", orderId);

  onSnapshot(orderRef, function(snapshot) {
    if (snapshot.exists()) {
      const order = snapshot.data();

      orderNumberText.classList.remove("hidden");
      orderNumberText.textContent = order.dailySequence
        ? `Order #${order.dailySequence}`
        : "Order in queue";
      orderFoodText.classList.remove("hidden");
      orderFoodText.textContent = order.foodName || "Food order";
      statusText.textContent = order.status;
      statusText.className = `statusPill ${order.status === "Ready to Serve" ? "readyPill" : "preparingPill"}`;

      if (order.status === "Ready to Serve" && readyNotified === false) {
        readyNotified = true;
        alert("Your food is ready to serve! Please collect your order at the counter.");
      }
    }
  });
}

renderCategoryFilters();
renderMenuItems();
renderSelectedItem(null);
