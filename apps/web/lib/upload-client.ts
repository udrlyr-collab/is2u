import { apiFetch } from "./client";

type UploadDescriptor = {
  id: string;
  assetId: string;
  multipart: boolean;
  url: string | null;
  partSize: number;
};

type PersistedUpload = { upload: UploadDescriptor; parts: Array<{ partNumber: number; etag: string }> };

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function storageKey(file: File): string {
  return `is2u_upload:${fingerprint(file)}`;
}

function putWithProgress(url: string, body: Blob, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded); };
    xhr.onerror = () => reject(new Error("네트워크 연결이 끊겼습니다."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag") ?? "");
      else reject(new Error(`업로드에 실패했습니다. (${xhr.status})`));
    };
    xhr.send(body);
  });
}

export async function uploadFile(memoryId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
  let state: PersistedUpload | null = null;
  const saved = localStorage.getItem(storageKey(file));
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as PersistedUpload;
      const status = await apiFetch<{ upload: { status: string } }>(`/api/uploads/${parsed.upload.id}`);
      if (status.upload.status === "uploading") state = parsed;
    } catch { localStorage.removeItem(storageKey(file)); }
  }
  if (!state) {
    const created = await apiFetch<{ upload: UploadDescriptor }>("/api/uploads", {
      method: "POST",
      body: JSON.stringify({ memoryId, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size }),
    });
    state = { upload: created.upload, parts: [] };
    localStorage.setItem(storageKey(file), JSON.stringify(state));
  }

  if (!state.upload.multipart) {
    if (!state.upload.url) throw new Error("업로드 주소가 없습니다.");
    await putWithProgress(state.upload.url, file, (loaded) => onProgress(Math.round((loaded / file.size) * 100)));
  } else {
    const count = Math.ceil(file.size / state.upload.partSize);
    const done = new Map(state.parts.map((part) => [part.partNumber, part]));
    let completedBytes = state.parts.reduce((total, part) => {
      const start = (part.partNumber - 1) * state!.upload.partSize;
      return total + Math.min(state!.upload.partSize, file.size - start);
    }, 0);
    for (let partNumber = 1; partNumber <= count; partNumber += 1) {
      if (done.has(partNumber)) continue;
      const [{ url }] = (await apiFetch<{ parts: Array<{ partNumber: number; url: string }> }>(`/api/uploads/${state.upload.id}/parts`, {
        method: "POST", body: JSON.stringify({ partNumbers: [partNumber] }),
      })).parts;
      const start = (partNumber - 1) * state.upload.partSize;
      const blob = file.slice(start, Math.min(start + state.upload.partSize, file.size));
      const etag = await putWithProgress(url, blob, (loaded) => onProgress(Math.round(((completedBytes + loaded) / file.size) * 100)));
      const part = { partNumber, etag };
      state.parts.push(part);
      completedBytes += blob.size;
      localStorage.setItem(storageKey(file), JSON.stringify(state));
    }
  }
  const completed = await apiFetch<{ asset: { id: string } }>(`/api/uploads/${state.upload.id}/complete`, { method: "POST", body: JSON.stringify({ parts: state.parts }) });
  localStorage.removeItem(storageKey(file));
  onProgress(100);
  return completed.asset.id;
}

