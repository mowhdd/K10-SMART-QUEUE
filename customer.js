const READY_NOTIFIED_KEY = "readyNotifiedOrderIds";

function getReadyNotifiedIds() {
  return new Set(JSON.parse(localStorage.getItem(READY_NOTIFIED_KEY) || "[]"));
}

function saveReadyNotifiedIds(ids) {
  localStorage.setItem(READY_NOTIFIED_KEY, JSON.stringify([...ids]));
}

function isReadyToServe(order) {
  return order.status === "Ready to serve" || order.status === "ready";
}

function notifyReadyOnce(order) {
  if (!isReadyToServe(order)) return;

  const notifiedIds = getReadyNotifiedIds();
  const orderId = String(order.id);

  if (notifiedIds.has(orderId)) return;

  alert(`${order.foodName || "Your order"} is ready to serve!`);

  notifiedIds.add(orderId);
  saveReadyNotifiedIds(notifiedIds);
}

function shouldShowOrderOnCustomerPage(order) {
  const notifiedIds = getReadyNotifiedIds();

  return !(isReadyToServe(order) && notifiedIds.has(String(order.id)));
}

import {
  db,
  collection,
  addDoc,
  onSnapshot,
  doc,
  serverTimestamp,
  runTransaction,
  query,
  where
} from "./firebase.js";

const menuItems = [
  {
    name: "Nasi Goreng Pattaya",
    category: "Rice",
    description: "Fried rice wrapped in a soft omelette with chilli sauce.",
    price: "RM 12"
  },
  {
    name: "Nasi Lemak Ayam Goreng ",
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
const menuGrid = document.getElementById("menuGrid");
const categoryFilters = document.getElementById("categoryFilters");
const selectedItemCard = document.getElementById("selectedItemCard");
const foodNameInput = document.getElementById("foodName");
const draftOrderList = document.getElementById("draftOrderList");
const submittedOrdersList = document.getElementById("submittedOrdersList");
const submitAllOrdersButton = document.getElementById("submitAllOrdersButton");

let selectedCategory = "All";
let selectedItemName = "";
let draftOrders = [];
let submittedOrders = [];
let readyNotifications = new Set();
let customerOrderUnsubscribe = null;

const customerSessionId = getCustomerSessionId();

function getCustomerSessionId() {
  const storageKey = "selera-kampung-customer-session";
  const existingSessionId = window.localStorage.getItem(storageKey);

  if (existingSessionId) {
    return existingSessionId;
  }

  const nextSessionId = `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(storageKey, nextSessionId);
  return nextSessionId;
}

function getOrderDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function reserveDailySequenceRange(orderDateKey, orderCount) {
  const counterRef = doc(db, "dailyCounters", orderDateKey);

  return runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const lastSequence = counterSnapshot.exists()
      ? Number(counterSnapshot.data().lastSequence || 0)
      : 0;
    const firstSequence = lastSequence + 1;
    const lastReservedSequence = lastSequence + orderCount;

    transaction.set(
      counterRef,
      {
        lastSequence: lastReservedSequence,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return firstSequence;
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

function resetMenuSelection() {
  orderForm.reset();
  document.getElementById("quantity").value = 1;
  selectedItemName = "";
  foodNameInput.value = "";
  renderMenuItems();
  renderSelectedItem(null);
}

function renderDraftOrders() {
  if (draftOrders.length === 0) {
    draftOrderList.className = "draftOrderList emptyStack";
    draftOrderList.innerHTML = `<p class="selectedPlaceholder">No dishes added yet.</p>`;
    submitAllOrdersButton.disabled = true;
    return;
  }

  draftOrderList.className = "draftOrderList";
  draftOrderList.innerHTML = draftOrders
    .map(
      (order, index) => `
        <article class="draftOrderItem">
          <div>
            <p class="metaLabel">Item ${index + 1}</p>
            <h4>${order.foodName}</h4>
            <p class="draftOrderMeta">Quantity ${order.quantity}</p>
          </div>
          <button type="button" class="ghostButton removeDraftButton" data-index="${index}">Remove</button>
        </article>
      `
    )
    .join("");

  submitAllOrdersButton.disabled = false;

  draftOrderList.querySelectorAll(".removeDraftButton").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      draftOrders.splice(index, 1);
      renderDraftOrders();
    });
  });
}

orders.forEach(notifyReadyOnce);

const visibleOrders = orders.filter(shouldShowOrderOnCustomerPage);

function renderSubmittedOrders(visibleOrders) {
  const sortedSubmittedOrders = [...submittedOrders].sort((left, right) => {
    const leftDate = left.orderDateKey || "";
    const rightDate = right.orderDateKey || "";

    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    const leftSequence = Number(left.dailySequence || 0);
    const rightSequence = Number(right.dailySequence || 0);

    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }

    const leftCreatedAt = left.createdAt?.seconds || 0;
    const rightCreatedAt = right.createdAt?.seconds || 0;
    return leftCreatedAt - rightCreatedAt;
  });

  if (sortedSubmittedOrders.length === 0) {
    orderStatus.classList.add("hidden");
    submittedOrdersList.innerHTML = "";
    return;
  }

  orderStatus.classList.remove("hidden");
  submittedOrdersList.innerHTML = sortedSubmittedOrders
    .map((order) => {
      const statusClass = order.status === "Ready to Serve" ? "readyPill" : "preparingPill";
      const queueNumber = order.dailySequence ? `Order #${order.dailySequence}` : "Order in queue";

      return `
        <article class="submittedOrderCard">
          <div class="submittedOrderTop">
            <div>
              <p class="queueNumber">${queueNumber}</p>
              <h4>${order.foodName}</h4>
            </div>
            <span class="statusPill ${statusClass}">${order.status}</span>
          </div>
          <p class="draftOrderMeta">Quantity ${order.quantity}</p>
        </article>
      `;
    })
    .join("");
}

function subscribeToCustomerOrders() {
  if (customerOrderUnsubscribe) {
    customerOrderUnsubscribe();
  }

  const customerOrdersQuery = query(
    collection(db, "orders"),
    where("customerSessionId", "==", customerSessionId)
  );

  customerOrderUnsubscribe = onSnapshot(customerOrdersQuery, (snapshot) => {
    submittedOrders = snapshot.docs.map((documentData) => ({
      id: documentData.id,
      ...documentData.data()
    }));

    submittedOrders.forEach((order) => {
      if (order.status === "Ready to Serve" && !readyNotifications.has(order.id)) {
        readyNotifications.add(order.id);
        alert(`${order.foodName} is ready to serve! Please collect your order at the counter.`);
      }
    });

    renderSubmittedOrders(visibleOrders);
  });
}

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const foodName = foodNameInput.value;
  const quantity = Number(document.getElementById("quantity").value);

  if (!foodName) {
    alert("Please choose a menu item before adding it to your order.");
    return;
  }

  if (!quantity || quantity < 1) {
    alert("Please enter a valid quantity.");
    return;
  }

  draftOrders.push({
    foodName,
    quantity
  });

  renderDraftOrders();
  resetMenuSelection();
});

submitAllOrdersButton.addEventListener("click", async () => {
  if (draftOrders.length === 0) {
    return;
  }

  const orderDateKey = getOrderDateKey();
  const firstSequence = await reserveDailySequenceRange(orderDateKey, draftOrders.length);
  const ordersToSubmit = [...draftOrders];

  submitAllOrdersButton.disabled = true;
  submitAllOrdersButton.textContent = "Sending Order...";

  try {
    await Promise.all(
      ordersToSubmit.map((draftOrder, index) => {
        const orderData = {
          foodName: draftOrder.foodName,
          quantity: Number(draftOrder.quantity),
          status: "Preparing",
          orderDateKey,
          dailySequence: firstSequence + index,
          customerSessionId,
          createdAt: serverTimestamp()
        };

        return addDoc(collection(db, "orders"), orderData);
      })
    );

    draftOrders = [];
    renderDraftOrders();
    resetMenuSelection();
  } finally {
    submitAllOrdersButton.textContent = "Finish Order";
    submitAllOrdersButton.disabled = draftOrders.length === 0;
  }
});

renderCategoryFilters();
renderMenuItems();
renderSelectedItem(null);
renderDraftOrders();
subscribeToCustomerOrders();
