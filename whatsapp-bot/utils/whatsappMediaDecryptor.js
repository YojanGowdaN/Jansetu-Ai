/**
 * utils/whatsappMediaDecryptor.js
 * 
 * Standalone Node.js native WhatsApp Media Downloader & Decryptor
 * Uses HKDFv3 (RFC 5869) + AES-256-CBC decryption.
 * Independent of browser-side Webpack changes.
 */

const crypto = require("crypto");
const axios = require("axios");
const logger = require("./logger");

const MEDIA_INFO_MAP = {
  audio: "WhatsApp Audio Keys",
  ptt: "WhatsApp Audio Keys",
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  document: "WhatsApp Document Keys"
};

/**
 * Decrypts WhatsApp media buffer using mediaKey and HKDFv3.
 */
function decryptMediaBuffer(encryptedBuffer, mediaKeyBase64, mediaType = "audio") {
  try {
    const mediaKey = Buffer.isBuffer(mediaKeyBase64) 
      ? mediaKeyBase64 
      : Buffer.from(mediaKeyBase64, "base64");

    const infoStr = MEDIA_INFO_MAP[mediaType] || "WhatsApp Audio Keys";
    const derived = crypto.hkdfSync(
      "sha256",
      mediaKey,
      Buffer.alloc(0), // empty salt
      Buffer.from(infoStr, "utf8"),
      112 // 112 bytes total: iv (16) + cipherKey (32) + macKey (32) + refKey (32)
    );

    const derivedBuffer = Buffer.from(derived);
    const iv = derivedBuffer.subarray(0, 16);
    const cipherKey = derivedBuffer.subarray(16, 48);

    // The encrypted file has a 10-byte MAC appended at the end
    const fileData = encryptedBuffer.subarray(0, encryptedBuffer.length - 10);

    const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(fileData), decipher.final()]);

    return decrypted;
  } catch (err) {
    logger.warn(`Decryption error: ${err.message}`);
    return null;
  }
}

/**
 * Downloads encrypted media directly from WhatsApp CDN and decrypts it with progress logging.
 */
async function downloadAndDecryptMedia({ directPath, mediaKey, type, mimetype, size, label = "Media" }) {
  if (!directPath || !mediaKey) {
    logger.warn(`Missing directPath or mediaKey for ${label}`);
    return null;
  }

  const cdnUrl = directPath.startsWith("http") 
    ? directPath 
    : `https://mmg.whatsapp.net${directPath}`;

  logger.info(`WhatsApp CDN → Downloading ${label} (${size ? Math.round(size / 1024) + " KB" : "streaming"})...`);

  try {
    const response = await axios.get(cdnUrl, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers: {
        "User-Agent": "WhatsApp/2.24.6.77 Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Origin": "https://web.whatsapp.com",
        "Referer": "https://web.whatsapp.com/"
      },
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          const loadedKb = Math.round(progressEvent.loaded / 1024);
          const totalKb = Math.round(progressEvent.total / 1024);
          logger.info(`WhatsApp → ⏳ Downloading ${label}: ${percent}% (${loadedKb}/${totalKb} KB)`);
        }
      }
    });

    const encryptedData = Buffer.from(response.data);
    logger.info(`WhatsApp → 🔐 Decrypting ${label} (${Math.round(encryptedData.length / 1024)} KB)...`);

    const decryptedData = decryptMediaBuffer(encryptedData, mediaKey, type || (mimetype?.startsWith("image") ? "image" : "audio"));
    if (decryptedData && decryptedData.length > 0) {
      const sizeKb = Math.round(decryptedData.length / 1024);
      logger.info(`WhatsApp → ✅ ${label} downloaded & decrypted successfully (100% - ${sizeKb} KB, mime: ${mimetype})`);
      return {
        data: decryptedData.toString("base64"),
        mimetype: mimetype || (type === "image" ? "image/jpeg" : "audio/ogg"),
        size: decryptedData.length
      };
    }
  } catch (err) {
    logger.warn(`WhatsApp CDN download failed: ${err.message}`);
  }

  return null;
}

module.exports = { decryptMediaBuffer, downloadAndDecryptMedia };
