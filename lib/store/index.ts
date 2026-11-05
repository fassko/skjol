import "server-only";
import { config } from "../config";
import { ArkivStore } from "./arkiv";
import { MemoryStore } from "./memory";
import type { AppStore } from "./types";

let _store: AppStore | null = null;

export function store(): AppStore {
  if (_store) return _store;
  _store = config.storeBackend() === "memory" ? new MemoryStore() : new ArkivStore();
  return _store;
}

export function setStoreForTests(s: AppStore) {
  _store = s;
}

export * from "./types";
