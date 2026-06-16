import {
  db,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy
} from "./firebase.js";

const ordersList = document.getElementById("ordersList");
const liveQueueToggle = document.getElementById("liveQueueToggle");
const sortModeToggle = document.getElementById("sortModeToggle");
const readyHelperToggle = document.getElementById("readyHelperToggle");
const liveQueueValue = document.getElementById("liveQueueValue");
const sortModeValue = document.getElementById("sortModeValue");
const readyHelperValue = document.getElementById("readyHelperValue");

const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
let allOrders = [];
let showLiveQueueOnly = true;
let sortMode = "sequence";
let highlightReadyActions = true;

onSnapshot(ordersQuery, function(snapshot) {
  allOrders = snapshot.docs.map((documentData) => ({
    id: documentData.id,
    ...documentData.data()
  }));
  renderOrders();
});

async function markReady(orderId) {
  const orderRef = doc(db, "orders", orderId);

  await updateDoc(orderRef, {
    status: "Ready to Serve"
  });
}

function getDisplaySequence(order) {
  return Number.isFinite(Number(order.dailySequence))
    ? Number(order.dailySequence)
    : null;
}

function sortOrders(orders) {
  const sortedOrders = [...orders];

  if (sortMode === "newest") {
    return sortedOrders.sort((left, right) => {
      const leftCreatedAt = left.createdAt?.seconds || 0;
      const rightCreatedAt = right.createdAt?.seconds || 0;
      return rightCreatedAt - leftCreatedAt;
    });
  }

  return sortedOrders.sort((left, right) => {
    const leftDate = left.orderDateKey || "";
    const rightDate = right.orderDateKey || "";

    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    const leftSequence = getDisplaySequence(left) ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = getDisplaySequence(right) ?? Number.MAX_SAFE_INTEGER;

    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }

    const leftCreatedAt = left.createdAt?.seconds || 0;
    const rightCreatedAt = right.createdAt?.seconds || 0;
    return leftCreatedAt - rightCreatedAt;
  });
}

function renderOrders() {
  const activeOrders = allOrders.filter((order) => order.status !== "Ready to Serve");
  const readyOrders = allOrders.filter((order) => order.status === "Ready to Serve");
  const visibleOrders = showLiveQueueOnly ? activeOrders : allOrders;
  const sortedOrders = sortOrders(visibleOrders);

  liveQueueValue.textContent = showLiveQueueOnly
    ? `${activeOrders.length} active`
    : `${allOrders.length} total shown`;
  sortModeValue.textContent = sortMode === "sequence" ? "Tap for newest first" : "Tap for sequence order";
  readyHelperValue.textContent = highlightReadyActions
    ? `${activeOrders.length} waiting for action`
    : "Highlighting off";

  liveQueueToggle.classList.toggle("active", showLiveQueueOnly);
  sortModeToggle.classList.toggle("active", sortMode === "sequence");
  readyHelperToggle.classList.toggle("active", highlightReadyActions);
  ordersList.classList.toggle("helperMode", highlightReadyActions);

  if (sortedOrders.length === 0) {
    const emptyTitle = showLiveQueueOnly ? "The live queue is clear for now." : "No orders found.";
    const emptyBody = showLiveQueueOnly
      ? "New customer orders will appear here automatically."
      : "Try switching back to live queue mode after new orders arrive.";

    ordersList.innerHTML = `
      <div class="emptyState">
        <p class="eyebrow">No live orders</p>
        <h3>${emptyTitle}</h3>
        <p>${emptyBody}</p>
      </div>
    `;
    return;
  }

  ordersList.innerHTML = "";

  sortedOrders.forEach((order) => {
    const isReady = order.status === "Ready to Serve";
    const displaySequence = getDisplaySequence(order);

    const orderCard = document.createElement("article");
    orderCard.className = `orderCard ${highlightReadyActions && !isReady ? "actionFocus" : ""}`;

    orderCard.innerHTML = `
      <div class="orderCardTop">
        <div>
          <p class="orderId">${displaySequence ? `Order #${displaySequence}` : "Order in queue"}</p>
          <h3>${order.foodName}</h3>
        </div>
        <span class="statusPill ${isReady ? "readyPill" : "preparingPill"}">${order.status}</span>
      </div>
      <div class="orderMetaGrid">
        <div>
          <p class="metaLabel">Table</p>
          <strong>${order.tableNo}</strong>
        </div>
        <div>
          <p class="metaLabel">Quantity</p>
          <strong>${order.quantity}</strong>
        </div>
      </div>
      <button class="primaryButton readyButton" data-order-id="${order.id}" ${isReady ? "disabled" : ""}>
        ${isReady ? "Marked Ready" : "Ready to Serve"}
      </button>
    `;

    const readyButton = orderCard.querySelector(".readyButton");
    readyButton.addEventListener("click", async () => {
      if (isReady) {
        return;
      }

      await markReady(order.id);
    });

    ordersList.appendChild(orderCard);
  });
}

liveQueueToggle.addEventListener("click", () => {
  showLiveQueueOnly = !showLiveQueueOnly;
  liveQueueToggle.querySelector(".summaryTitle").textContent = showLiveQueueOnly ? "Live queue" : "All orders";
  renderOrders();
});

sortModeToggle.addEventListener("click", () => {
  sortMode = sortMode === "sequence" ? "newest" : "sequence";
  const title = sortMode === "sequence" ? "Sequence order" : "Newest orders first";
  sortModeToggle.querySelector(".summaryTitle").textContent = title;
  renderOrders();
});

readyHelperToggle.addEventListener("click", () => {
  highlightReadyActions = !highlightReadyActions;
  renderOrders();
});
