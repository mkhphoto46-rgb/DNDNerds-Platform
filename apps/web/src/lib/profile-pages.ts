export type ProfileImageKind = "avatar" | "banner" | "portrait" | "campaign";

const dimensions: Record<ProfileImageKind, { width: number; height: number; bytes: number; crop: boolean }> = {
  campaign: { width: 480, height: 320, bytes: 100_000, crop: true },
  avatar: { width: 400, height: 400, bytes: 100_000, crop: true },
  banner: { width: 1200, height: 300, bytes: 230_000, crop: true },
  portrait: { width: 600, height: 900, bytes: 190_000, crop: false },
};

export async function profileRequest<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(`/api/game-hub/${path}`, {
    method, cache: "no-store", credentials: "same-origin",
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "درخواست انجام نشد.");
  return body.data as T;
}

export async function prepareProfileImage(file: File, kind: ProfileImageKind): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5_000_000) throw new Error("فایل باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد.");
  const image = await createImageBitmap(file);
  try {
    if (image.width > 6000 || image.height > 6000) throw new Error("ابعاد تصویر اولیه بیش از حد بزرگ است.");
    const limit = dimensions[kind];
    let scale = 1;
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(limit.width * scale);
      canvas.height = Math.round(limit.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("پردازش تصویر در مرورگر ممکن نیست.");
      context.fillStyle = "#180f12";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const factor = limit.crop
        ? Math.max(canvas.width / image.width, canvas.height / image.height)
        : Math.min(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * factor, height = image.height * factor;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const value = canvas.toDataURL("image/webp", Math.max(0.5, 0.82 - attempt * 0.06));
      if (!value.startsWith("data:image/webp;base64,")) throw new Error("مرورگر از خروجی WebP پشتیبانی نمی‌کند.");
      if (Math.floor(value.slice(23).length * 3 / 4) <= limit.bytes) return value;
      scale *= 0.82;
    }
    throw new Error("حجم تصویر پس از فشرده‌سازی هنوز زیاد است. تصویر ساده‌تری انتخاب کن.");
  } finally { image.close(); }
}
