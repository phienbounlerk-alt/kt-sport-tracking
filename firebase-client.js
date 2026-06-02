import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// TODO: Replace these values with your Firebase Web App config.
// Firebase Console -> Project settings -> General -> Your apps -> Web app config.
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_FIREBASE_APP_ID",
};

const missingConfig = Object.values(firebaseConfig).some((value) => String(value).startsWith("PASTE_"));

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function ensureFirebaseConfig() {
  if (missingConfig) {
    throw new Error("ກະລຸນາໃສ່ Firebase config ໃນ firebase-client.js ກ່ອນໃຊ້ງານ");
  }
}

export function listenForAuth(callback) {
  ensureFirebaseConfig();
  return onAuthStateChanged(auth, callback);
}

export async function signInAndGetProfile(email, password) {
  ensureFirebaseConfig();
  const credential = await signInWithEmailAndPassword(auth, String(email).trim(), password);
  const userRef = doc(db, "users", credential.user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await signOut(auth);
    throw new Error("ບໍ່ພົບຂໍ້ມູນ user role ໃນ Firestore: users/" + credential.user.uid);
  }

  const profile = userSnap.data();
  if (!profile.role) {
    await signOut(auth);
    throw new Error("user ນີ້ຍັງບໍ່ມີ field role");
  }

  return { user: credential.user, profile };
}

export function listenToOrdersRealtime({ onAdded, onModified, onRemoved, onAll, onError } = {}) {
  ensureFirebaseConfig();
  const ordersQuery = query(collection(db, "orders"), orderBy("updatedAt", "desc"));

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const orders = [];
      snapshot.forEach((orderDoc) => {
        orders.push({ id: orderDoc.id, ...orderDoc.data() });
      });

      if (onAll) {
        onAll(orders);
      }

      snapshot.docChanges().forEach((change) => {
        const order = { id: change.doc.id, ...change.doc.data() };
        if (change.type === "added" && onAdded) onAdded(order);
        if (change.type === "modified" && onModified) onModified(order);
        if (change.type === "removed" && onRemoved) onRemoved(order);
      });
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      console.error("Firestore orders listener failed:", error);
    }
  );
}

export function renderOrdersToElement(container, orders) {
  if (!container) return;
  if (!orders.length) {
    container.innerHTML = '<p class="empty-state">ຍັງບໍ່ມີອໍເດີ້</p>';
    return;
  }

  container.innerHTML = orders
    .map((order) => {
      const title = order.customerName || order.customer || order.name || order.id;
      const status = order.status || order.step || "new";
      const updatedAt = order.updatedAt?.toDate ? order.updatedAt.toDate().toLocaleString() : order.updatedAt || "";
      return `
        <article class="order-card">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(status)}</span>
          <small>${escapeHtml(updatedAt)}</small>
        </article>
      `;
    })
    .join("");
}

export function signOutCurrentUser() {
  ensureFirebaseConfig();
  return signOut(auth);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
