// Turns whatever you hand the importer (pasted text, .eml, .html, .txt, PDF,
// screenshots) into plain text plus a few images for the AI to read.
// Everything happens in the browser; nothing is uploaded except to the AI call.

const MAX_TEXT = 60000; // characters sent to the model
const MAX_IMAGES = 4;
const MAX_SIDE = 1600; // px, longest side of images sent to the model

if (typeof Promise.withResolvers !== "function") {
  // pdf.js 4 relies on this; older Safari lacks it.
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
  };
}

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,head,noscript,svg").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p,div,tr,li,h1,h2,h3,h4,h5,h6,table,section").forEach((n) => n.append("\n"));
  doc.querySelectorAll("td,th").forEach((n) => n.append(" | "));
  // Keep "manage booking" style links; they're handy to store.
  doc.querySelectorAll("a[href^='http']").forEach((a) => {
    const t = (a.textContent || "").trim();
    if (/manage|view|booking|reservation|itinerary|订单|预订|行程/i.test(t) && t.length < 60) a.append(` <${a.getAttribute("href")}>`);
  });
  return tidy(doc.body?.textContent || "");
}

const tidy = (s) =>
  s.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ *\| *(\n|$)/g, "$1").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function canvasToJPEG(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return { mediaType: "image/jpeg", data: b64(await blob.arrayBuffer()) };
}

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToJPEG(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readPDF(buf, name) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = Math.min(pdf.numPages, 10);
  let text = "";
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let line = "";
    let lastY = null;
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { text += line.trim() + "\n"; line = ""; }
      line += it.str + (it.hasEOL ? "\n" : " ");
      lastY = y;
    }
    text += line.trim() + "\n\n";
  }
  text = tidy(text);
  // A scanned PDF has little or no text layer: send the first pages as images instead.
  const images = [];
  if (text.replace(/\s/g, "").length < 80 * pages) {
    for (let p = 1; p <= Math.min(pages, 3); p++) {
      const page = await pdf.getPage(p);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(2, MAX_SIDE / Math.max(vp1.width, vp1.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      images.push(await canvasToJPEG(canvas));
    }
  }
  return { text: text ? `--- ${name} ---\n${text}` : "", images };
}

async function readEML(buf, name) {
  const { default: PostalMime } = await import("postal-mime");
  const mail = await PostalMime.parse(buf);
  const body = mail.html ? htmlToText(mail.html) : tidy(mail.text || "");
  const head = [
    `--- ${name} ---`,
    mail.from ? `From: ${mail.from.name || ""} <${mail.from.address || ""}>` : "",
    mail.date ? `Date: ${mail.date}` : "",
    mail.subject ? `Subject: ${mail.subject}` : "",
  ].filter(Boolean).join("\n");
  let text = `${head}\n\n${body}`;
  const images = [];
  // Booking PDFs (e-tickets, vouchers) often ride along as attachments.
  for (const a of mail.attachments || []) {
    const type = (a.mimeType || "").toLowerCase();
    const aname = a.filename || "attachment";
    if (type === "application/pdf" || /\.pdf$/i.test(aname)) {
      const r = await readPDF(a.content, `${name} / ${aname}`);
      text += `\n\n${r.text}`;
      images.push(...r.images);
    } else if (type === "message/rfc822") {
      const r = await readEML(a.content, `${name} / ${aname}`);
      text += `\n\n${r.text}`;
      images.push(...r.images);
    }
  }
  return { text, images };
}

/** files: File[]; pasted: string. Returns { text, images, sources, warnings }. */
export async function readInputs(files = [], pasted = "") {
  let text = "";
  const images = [];
  const sources = [];
  const warnings = [];

  const p = (pasted || "").trim();
  if (p) {
    text += (/^\s*<(!doctype|html|div|table|body|meta)/i.test(p) ? htmlToText(p) : p) + "\n\n";
    sources.push("pasted text");
  }

  for (const f of files) {
    const name = f.name || "file";
    const type = (f.type || "").toLowerCase();
    try {
      if (type.startsWith("image/")) {
        images.push(await imageFromBlob(f));
      } else if (type === "application/pdf" || /\.pdf$/i.test(name)) {
        const r = await readPDF(await f.arrayBuffer(), name);
        text += r.text + "\n\n";
        images.push(...r.images);
      } else if (type === "message/rfc822" || /\.(eml|mht|mhtml)$/i.test(name)) {
        const r = await readEML(await f.arrayBuffer(), name);
        text += r.text + "\n\n";
        images.push(...r.images);
      } else if (type === "text/html" || /\.html?$/i.test(name)) {
        text += `--- ${name} ---\n${htmlToText(await f.text())}\n\n`;
      } else if (type.startsWith("text/") || /\.(txt|md)$/i.test(name) || !type) {
        text += `--- ${name} ---\n${tidy(await f.text())}\n\n`;
      } else {
        warnings.push(`Skipped ${name}: can't read this kind of file`);
        continue;
      }
      sources.push(name);
    } catch (e) {
      warnings.push(`Couldn't read ${name}${e?.message ? `: ${e.message}` : ""}`);
    }
  }

  if (text.length > MAX_TEXT) {
    text = text.slice(0, MAX_TEXT);
    warnings.push("The email is very long; only the first part was read");
  }
  if (images.length > MAX_IMAGES) {
    warnings.push(`Only the first ${MAX_IMAGES} images were read`);
    images.length = MAX_IMAGES;
  }
  return { text: text.trim(), images, sources, warnings };
}
