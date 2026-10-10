"use strict";
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { randomUUID } = require("node:crypto");
const { createHandler, reserveUsage } = require("./core");
initializeApp();
const db = getFirestore();
const key = defineSecret("OPENAI_API_KEY");
const model = defineString("OPENAI_MODEL", { default: "gpt-4.1-mini" });
const origins = ["https://zzonos.github.io", "http://localhost:8765", "http://127.0.0.1:8765"];
exports.gptStudy = onRequest({ region: "asia-northeast3", secrets: [key], timeoutSeconds: 120,
  memory: "256MiB", maxInstances: 5, invoker: "public" }, createHandler({
  origins, apiKey: () => key.value(), model: () => model.value(),
  verifyToken: token => getAuth().verifyIdToken(token, true),
  // Auth accounts without a successfully invite-created study document cannot spend API budget.
  isMember: async uid => (await db.doc(`users/${uid}`).get()).exists,
  reserve: async uid => {
    const id = randomUUID(), ref = db.doc(`gptUsage/${uid}`);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      tx.set(ref, reserveUsage(snap.data(), Date.now(), id));
    });
    return id;
  },
  release: async (uid, id) => {
    const ref = db.doc(`gptUsage/${uid}`);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data(); delete data.leases[id]; tx.set(ref, data);
    });
  }
}));
