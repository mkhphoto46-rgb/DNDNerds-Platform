export type ProfileImageKind = "avatar" | "banner" | "portrait" | "campaign";

const limits: Record<ProfileImageKind, { bytes: number; width: number; height: number }> = {
  campaign: { bytes: 100_000, width: 512, height: 512 },
  avatar: { bytes: 500_000, width: 512, height: 512 },
  banner: { bytes: 1_000_000, width: 1400, height: 400 },
  portrait: { bytes: 190_000, width: 900, height: 1400 },
};

function webpDimensions(data: Buffer): { width: number; height: number } | null {
  if (data.length < 30 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") return null;
  if (data.readUInt32LE(4) + 8 !== data.length) return null;
  const format = data.toString("ascii", 12, 16);
  if (format === "VP8X") return {
    width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3),
  };
  if (format === "VP8L" && data[20] === 0x2f) return {
    width: 1 + data[21]! + ((data[22]! & 0x3f) << 8),
    height: 1 + (data[22]! >> 6) + (data[23]! << 2) + ((data[24]! & 0x0f) << 10),
  };
  if (format === "VP8 " && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) return {
    width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff,
  };
  return null;
}

export function validProfileImage(value: unknown, kind: ProfileImageKind): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !value.startsWith("data:image/webp;base64,")) return false;
  const encoded = value.slice("data:image/webp;base64,".length);
  if (!encoded || encoded.length > Math.ceil(limits[kind].bytes * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const data = Buffer.from(encoded, "base64");
  if (data.length > limits[kind].bytes || data.toString("base64") !== encoded) return false;
  const dimensions = webpDimensions(data);
  return Boolean(dimensions && dimensions.width > 0 && dimensions.height > 0 && dimensions.width <= limits[kind].width && dimensions.height <= limits[kind].height);
}
