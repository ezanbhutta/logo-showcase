// Data sources: where the logo library is read from.
//
//  • FsSource    — a real local folder picked via the File System Access API
//                  (the user's Google Drive for Desktop sync folder). Files are
//                  read in the browser; nothing is uploaded.
//  • FetchSource — the bundled demo library served from the site, so the app
//                  works (and is testable) without picking a folder.
//
// Both expose the same async interface:
//   listProfiles()           -> [name, ...]
//   getText(profile, path)   -> string
//   getBytes(profile, path)  -> Uint8Array
//   getBlob(profile, path)   -> Blob   (for images)

// ---- File System Access API source ----------------------------------------

export class FsSource {
  constructor(rootHandle) { this.root = rootHandle; this._profileDirs = null; }

  async _profiles() {
    if (this._profileDirs) return this._profileDirs;
    const map = new Map();
    // A studio is any folder that contains a tags.csv (theme.json is optional —
    // a sensible default theme is used when it's missing). We also support the
    // case where the attached folder IS a single studio.
    let rootHasTags = false;
    const subdirs = [];
    for await (const [name, handle] of this.root.entries()) {
      if (handle.kind === "file" && name === "tags.csv") rootHasTags = true;
      else if (handle.kind === "directory") subdirs.push([name, handle]);
    }
    if (rootHasTags) map.set(this.root.name || "library", this.root);
    for (const [name, handle] of subdirs) {
      let hasTags = false;
      try {
        for await (const [child, ch] of handle.entries()) {
          if (ch.kind === "file" && child === "tags.csv") { hasTags = true; break; }
        }
      } catch { /* unreadable subfolder — skip */ }
      if (hasTags) map.set(name, handle);
    }
    this._profileDirs = map;
    return map;
  }

  async listProfiles() {
    return [...(await this._profiles()).keys()].sort();
  }

  async _fileHandle(profile, path) {
    const profiles = await this._profiles();
    let dir = profiles.get(profile);
    if (!dir) throw new Error(`Profile '${profile}' not found`);
    const parts = path.split("/");
    const fileName = parts.pop();
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    return dir.getFileHandle(fileName);
  }

  async getText(profile, path) {
    const fh = await this._fileHandle(profile, path);
    return (await fh.getFile()).text();
  }
  async getBlob(profile, path) {
    const fh = await this._fileHandle(profile, path);
    return fh.getFile();
  }
  async getBytes(profile, path) {
    return new Uint8Array(await (await this.getBlob(profile, path)).arrayBuffer());
  }
}

// ---- Bundled demo source ---------------------------------------------------

export class FetchSource {
  constructor(base = "demo") { this.base = base; }

  async listProfiles() {
    const res = await fetch(`${this.base}/index.json`);
    if (!res.ok) throw new Error("demo library not found");
    return (await res.json()).profiles;
  }
  async getText(profile, path) {
    const res = await fetch(`${this.base}/${profile}/${path}`);
    if (!res.ok) throw new Error(`missing ${profile}/${path}`);
    return res.text();
  }
  async getBlob(profile, path) {
    const res = await fetch(`${this.base}/${profile}/${path}`);
    if (!res.ok) throw new Error(`missing ${profile}/${path}`);
    return res.blob();
  }
  async getBytes(profile, path) {
    return new Uint8Array(await (await this.getBlob(profile, path)).arrayBuffer());
  }
}

// ---- Persisting the chosen folder handle (so you attach it only once) ------

const DB = "logo-showcase";
const STORE = "handles";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(handle) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, "library");
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

export async function loadHandle() {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("library");
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}

export async function clearHandle() {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete("library");
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

export async function verifyPermission(handle, mode = "read") {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

export function fsAccessSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
