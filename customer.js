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
  { name: "Nasi Goreng Pattaya", category: "Rice", description: "Fried rice wrapped in a soft omelette with chilli sauce.", price: "RM 12" },
  { name: "Nasi Lemak Ayam Goreng", category: "Rice", description: "Coconut rice, crispy fried chicken, sambal, egg, and peanuts.", price: "RM 14" },
  { name: "Nasi Paprik", category: "Rice", description: "Steamed rice with spicy paprik chicken and vegetables.", price: "RM 13" },
  { name: "Mee Goreng Mamak", category: "Noodles", description: "Wok-fried yellow noodles with tofu, egg, and bold mamak spices.", price: "RM 11" },
  { name: "Kuey Teow Goreng", category: "Noodles", description: "Flat rice noodles stir-fried with egg, vegetables, and savoury sauce.", price: "RM 11" },
  { name: "Char Kuey Teow", category: "Noodles", description: "Smoky wok-fried noodles with prawns, chives, and bean sprouts.", price: "RM 13" },
  { name: "Satay Ayam", category: "Sides", description: "Grilled chicken skewers served with peanut sauce and cucumber.", price: "RM 10" },
  { name: "Roti Canai", category: "Sides", description: "Flaky flatbread served with dhal curry.", price: "RM 4" },
  { name: "Teh Tarik Ais", category: "Drinks", description: "Pulled milk tea served cold and refreshing.", price: "RM 4" },
  { name: "Sirap Limau", category: "Drinks", description: "Rose syrup with lime for a bright sweet-tangy finish.", price: "RM 4" }
];

const menuGrid = document.getElementById("menuGrid");
const categoryFilters = document.getElementById("categoryFilters");
const draftOrderList = document.getElementById("draftOrderList");
const submittedOrdersList = document.getElementById("submittedOrdersList");
const submitAllOrdersButton = document.getElementById("submitAllOrdersButton");
const orderStatus = document.getElementById("orderStatus");
const itemModal = document.getElementById("itemModal");
const itemModalForm = document.getElementById("itemModalForm");
const itemModalTitle = document.getElementById("itemModalTitle");
const itemModalDescription = document.getElementById("itemModalDescription");
const itemModalPrice = document.getElementById("itemModalPrice");
const modalQuantity = document.getElementById("modalQuantity");
const modalRemarks = document.getElementById("modalRemarks");
const closeItemModalButton = document.getElementById("closeItemModalButton");
const mobileOrderPrompt = document.getElementById("mobileOrderPrompt");
const mobileOrderScrollButton = document.getElementById("mobileOrderScrollButton");
const orderSection = document.querySelector(".orderSection");

let selectedCategory = "All";
let draftOrders = [];
let submittedOrders = [];
let readyNotifications = new Set();
let customerOrderUnsubscribe = null;
let activeModalItem = null;
let promptTimer;

const customerSessionId = `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function showMobileOrderPrompt() {
  if (!window.matchMedia("(max-width: 640px)").matches) {
    return;
  }

  clearTimeout(promptTimer);
  mobileOrderPrompt.classList.add("isVisible");
  mobileOrderPrompt.setAttribute("aria-hidden", "false");

  promptTimer = window.setTimeout(() => {
    mobileOrderPrompt.classList.remove("isVisible");
    mobileOrderPrompt.setAttribute("aria-hidden", "true");
  }, 5000);
}

function hideMobileOrderPrompt() {
  clearTimeout(promptTimer);
  mobileOrderPrompt.classList.remove("isVisible");
  mobileOrderPrompt.setAttribute("aria-hidden", "true");
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

    transaction.set(
      counterRef,
      {
        lastSequence: lastSequence + orderCount,
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
        <article class="menuCard" data-item="${item.name}">
          <span class="menuBadge">${item.category}</span>
          <h3>${item.name}</h3>
          <p>${item.description}</p>
          <div class="menuFooter">
            <span>${item.price}</span>
            <button type="button" class="menuActionButton" data-item="${item.name}">Select</button>
          </div>
        </article>
      `
    )
    .join("");

  menuGrid.querySelectorAll(".menuActionButton").forEach((button) => {
    button.addEventListener("click", () => {
      const item = menuItems.find((menuItem) => menuItem.name === button.dataset.item);
      openItemModal(item);
    });
  });
}

function openItemModal(item) {
  activeModalItem = item;
  itemModalTitle.textContent = item.name;
  itemModalDescription.textContent = item.description;
  itemModalPrice.textContent = item.price;
  modalQuantity.value = 1;
  modalRemarks.value = "";
  itemModal.classList.remove("hidden");
  itemModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modalOpen");
}

function closeItemModal() {
  activeModalItem = null;
  itemModal.classList.add("hidden");
  itemModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modalOpen");
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
            ${order.remarks ? `<p class="remarksText">Remarks: ${order.remarks}</p>` : ""}
          </div>
          <button type="button" class="ghostButton removeDraftButton" data-index="${index}">Remove</button>
        </article>
      `
    )
    .join("");

  submitAllOrdersButton.disabled = false;

  draftOrderList.querySelectorAll(".removeDraftButton").forEach((button) => {
    button.addEventListener("click", () => {
      draftOrders.splice(Number(button.dataset.index), 1);
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

      return `
        <article class="submittedOrderCard">
          <div class="submittedOrderTop">
            <div>
              <p class="queueNumber">${order.dailySequence ? `Order #${order.dailySequence}` : "Order in queue"}</p>
              <h4>${order.foodName}</h4>
            </div>
            <span class="statusPill ${statusClass}">${order.status}</span>
          </div>
          <p class="draftOrderMeta">Quantity ${order.quantity}</p>
          ${order.remarks ? `<p class="remarksText">Remarks: ${order.remarks}</p>` : ""}
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

itemModalForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!activeModalItem) {
    return;
  }

  const quantity = Number(modalQuantity.value);
  const remarks = modalRemarks.value.trim();

  if (!quantity || quantity < 1) {
    alert("Please enter a valid quantity.");
    return;
  }

  draftOrders.push({
    foodName: activeModalItem.name,
    quantity,
    remarks
  });

  renderDraftOrders();
  closeItemModal();
  showMobileOrderPrompt();
});

submitAllOrdersButton.addEventListener("click", async () => {
  if (draftOrders.length === 0) {
    return;
  }

  const orderDateKey = getOrderDateKey();
  const ordersToSubmit = [...draftOrders];
  const firstSequence = await reserveDailySequenceRange(orderDateKey, ordersToSubmit.length);

  submitAllOrdersButton.disabled = true;
  submitAllOrdersButton.textContent = "Confirming Order...";

  try {
    await Promise.all(
      ordersToSubmit.map((draftOrder, index) => {
        const orderData = {
          foodName: draftOrder.foodName,
          quantity: Number(draftOrder.quantity),
          remarks: draftOrder.remarks,
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
    orderSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    submitAllOrdersButton.textContent = "Checkout And Confirm Order";
    submitAllOrdersButton.disabled = draftOrders.length === 0;
  }
});

closeItemModalButton.addEventListener("click", closeItemModal);
itemModal.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
    closeItemModal();
  }
});

mobileOrderScrollButton.addEventListener("click", () => {
  hideMobileOrderPrompt();
  orderSection?.scrollIntoView({ behavior: "smooth", block: "start" });
});

renderCategoryFilters();
renderMenuItems();
renderDraftOrders();
renderSubmittedOrders();
subscribeToCustomerOrders();
