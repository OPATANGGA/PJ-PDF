// Initialize Lucide Icons & Service Worker
document.addEventListener("DOMContentLoaded", () => {
    if (window.lucide) {
        lucide.createIcons();
    }
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
});

// Utility: Format bytes
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Toast Notification
let toastTimeout = null;
function showToast(msg, isError = false) {
    const toast = document.getElementById("status-toast");
    toast.textContent = msg;
    toast.style.borderColor = isError ? "#ef4444" : "#6366f1";
    toast.classList.remove("hidden");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 4500);
}

// Global Loading Overlay
function showLoader(title = "กำลังประมวลผลไฟล์...", subtitle = "ประมวลผลในเครื่องอย่างปลอดภัย 100%") {
    document.getElementById("loading-title").textContent = title;
    document.getElementById("loading-subtitle").textContent = subtitle;
    document.getElementById("loading-overlay").classList.remove("hidden");
}

function hideLoader() {
    document.getElementById("loading-overlay").classList.add("hidden");
}

// Download Blob Helper
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// Setup Drag & Drop Zone
function setupDropzone(zoneId, inputId, onFilesSelected) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
        if (input.files && input.files.length > 0) {
            onFilesSelected(Array.from(input.files));
        }
    });

    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(Array.from(e.dataTransfer.files));
        }
    });
}

// ==========================================
// NAVIGATION, MOBILE DRAWER & THEME SWITCHER
// ==========================================
const TAB_TITLES = {
    "dashboard": "หน้าหลักรวมเครื่องมือ",
    "organize": "แยก / ลบ / หมุน / เรียงหน้า PDF",
    "merge": "รวมไฟล์ PDF (Merge)",
    "remove-wm": "ลบลายน้ำอัจฉริยะ (Remove Watermark)",
    "add-wm": "ใส่ลายน้ำ (Add Watermark)",
    "compress": "บีบอัดขนาดไฟล์ (Compress PDF)",
    "pdf-office": "แปลงไฟล์ PDF ⇄ Word / Excel / Text",
    "pdf-images": "แปลงไฟล์ PDF ⇄ รูปภาพ (PNG / JPG)",
    "ocr": "สแกนข้อความ OCR (ไทย / อังกฤษ)",
    "security": "ล็อก / ปลดล็อกรหัสผ่าน PDF",
};

const sidebar = document.getElementById("app-sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function closeMobileSidebar() {
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.add("hidden");
}

function openMobileSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.remove("hidden");
}

document.getElementById("open-sidebar-btn")?.addEventListener("click", openMobileSidebar);
document.getElementById("mobile-more-btn")?.addEventListener("click", openMobileSidebar);
document.getElementById("close-sidebar-btn")?.addEventListener("click", closeMobileSidebar);
sidebarBackdrop?.addEventListener("click", closeMobileSidebar);

function switchTab(tabId) {
    document.querySelectorAll(".nav-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === tabId);
    });
    document.querySelectorAll(".m-nav-item[data-tab]").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === tabId);
    });
    document.querySelectorAll(".tool-section").forEach((s) => {
        s.classList.toggle("active", s.id === `tab-${tabId}`);
    });
    document.getElementById("current-tool-title").textContent = TAB_TITLES[tabId] || "PDF Studio Pro";
    closeMobileSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-btn[data-tab], .m-nav-item[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll(".bento-card[data-goto]").forEach((card) => {
    card.addEventListener("click", () => switchTab(card.dataset.goto));
});

document.getElementById("back-to-home-btn")?.addEventListener("click", () => switchTab("dashboard"));

// Theme Toggle (Dark / Light)
const htmlEl = document.documentElement;
const savedTheme = localStorage.getItem("pdf-studio-theme") || "dark";
htmlEl.setAttribute("data-theme", savedTheme);

document.getElementById("theme-toggle-btn")?.addEventListener("click", () => {
    const current = htmlEl.getAttribute("data-theme") === "light" ? "dark" : "light";
    htmlEl.setAttribute("data-theme", current);
    localStorage.setItem("pdf-studio-theme", current);
    const iconEl = document.getElementById("theme-icon");
    if (iconEl && window.lucide) {
        iconEl.setAttribute("data-lucide", current === "light" ? "moon" : "sun");
        lucide.createIcons();
    }
});

// ==========================================
// CROSS-PLATFORM QR MODAL & PWA INSTALL
// ==========================================
const qrModal = document.getElementById("qr-modal");
document.getElementById("open-qr-btn")?.addEventListener("click", async () => {
    qrModal.classList.remove("hidden");
    try {
        const res = await fetch("/api/system-info");
        const info = await res.json();
        const url = info.lan_url || window.location.origin;
        document.getElementById("lan-url-display").textContent = url;

        if (window.qrcode) {
            const qr = qrcode(0, "M");
            qr.addData(url);
            qr.make();
            document.getElementById("qr-code-container").innerHTML = qr.createSvgTag(5, 0);
        }
    } catch (e) {
        document.getElementById("lan-url-display").textContent = window.location.origin;
    }
});

document.getElementById("close-qr-modal")?.addEventListener("click", () => {
    qrModal.classList.add("hidden");
});

qrModal?.addEventListener("click", (e) => {
    if (e.target === qrModal) qrModal.classList.add("hidden");
});

document.getElementById("copy-lan-url-btn")?.addEventListener("click", () => {
    const url = document.getElementById("lan-url-display").textContent;
    navigator.clipboard.writeText(url);
    showToast("คัดลอกลิงก์สำหรับเปิดข้ามอุปกรณ์แล้ว!");
});

// PWA Install Prompt
let deferredPwaPrompt = null;
const pwaInstallBtn = document.getElementById("pwa-install-btn");

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    pwaInstallBtn?.classList.remove("hidden");
});

pwaInstallBtn?.addEventListener("click", async () => {
    if (!deferredPwaPrompt) return;
    deferredPwaPrompt.prompt();
    await deferredPwaPrompt.userChoice;
    deferredPwaPrompt = null;
    pwaInstallBtn.classList.add("hidden");
});

// ==========================================
// 1. ORGANIZE / SPLIT / ROTATE / DELETE
// ==========================================
let orgFile = null;
let orgOriginalPages = [];
let orgPagesState = [];

setupDropzone("org-dropzone", "org-file", async (files) => {
    orgFile = files[0];
    await loadOrganizePdf(orgFile);
});

document.getElementById("org-change-file").addEventListener("click", () => {
    document.getElementById("org-file").click();
});

async function loadOrganizePdf(file) {
    showLoader("กำลังอ่านหน้าไฟล์ PDF...", "กำลังสร้างภาพตัวอย่างทุกหน้า");
    const fd = new FormData();
    fd.append("file", file);

    try {
        const res = await fetch("/api/inspect", { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "ไม่สามารถเปิดไฟล์ได้");
        }
        const data = await res.json();
        if (data.encrypted) {
            showToast("ไฟล์นี้ติดรหัสผ่าน กรุณาปลดล็อกที่เมนู 'ล็อก/ปลดล็อกรหัสผ่าน' ก่อน", true);
            return;
        }

        document.getElementById("org-dropzone").classList.add("hidden");
        document.getElementById("org-workspace").classList.remove("hidden");
        document.getElementById("org-file-info").textContent = `📄 ${data.filename} (${data.page_count} หน้า • ${formatBytes(data.file_size)})`;

        orgOriginalPages = data.pages.map((p) => ({
            page: p.index,
            pageNumber: p.page_number,
            rotate: 0,
            thumb: p.thumbnail,
        }));
        orgPagesState = JSON.parse(JSON.stringify(orgOriginalPages));
        renderOrganizeGrid();
        showToast(`โหลดสำเร็จ ${data.page_count} หน้า`);
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
    }
}

function renderOrganizeGrid() {
    const grid = document.getElementById("org-pages-grid");
    grid.innerHTML = "";
    orgPagesState.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = "page-card";
        card.innerHTML = `
            <div class="page-thumb-wrap">
                <img src="${item.thumb}" style="transform: rotate(${item.rotate}deg)" alt="Page ${item.pageNumber}" />
            </div>
            <div class="page-card-footer">
                <span>หน้า ${item.pageNumber}</span>
                <div class="page-controls">
                    <button class="icon-btn" title="เลื่อนซ้าย" data-act="left" data-idx="${idx}">◀</button>
                    <button class="icon-btn" title="หมุน 90°" data-act="rot" data-idx="${idx}">↻</button>
                    <button class="icon-btn" title="เลื่อนขวา" data-act="right" data-idx="${idx}">▶</button>
                    <button class="icon-btn del" title="ลบหน้านี้" data-act="del" data-idx="${idx}">✕</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    grid.querySelectorAll(".icon-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const act = btn.dataset.act;
            if (act === "rot") {
                orgPagesState[idx].rotate = (orgPagesState[idx].rotate + 90) % 360;
            } else if (act === "del") {
                if (orgPagesState.length <= 1) {
                    showToast("ต้องเหลืออย่างน้อย 1 หน้า", true);
                    return;
                }
                orgPagesState.splice(idx, 1);
            } else if (act === "left" && idx > 0) {
                const tmp = orgPagesState[idx - 1];
                orgPagesState[idx - 1] = orgPagesState[idx];
                orgPagesState[idx] = tmp;
            } else if (act === "right" && idx < orgPagesState.length - 1) {
                const tmp = orgPagesState[idx + 1];
                orgPagesState[idx + 1] = orgPagesState[idx];
                orgPagesState[idx] = tmp;
            }
            renderOrganizeGrid();
        });
    });
}

document.getElementById("org-rotate-all-left").addEventListener("click", () => {
    orgPagesState.forEach((p) => (p.rotate = (p.rotate + 270) % 360));
    renderOrganizeGrid();
});
document.getElementById("org-rotate-all-right").addEventListener("click", () => {
    orgPagesState.forEach((p) => (p.rotate = (p.rotate + 90) % 360));
    renderOrganizeGrid();
});
document.getElementById("org-reset-pages").addEventListener("click", () => {
    orgPagesState = JSON.parse(JSON.stringify(orgOriginalPages));
    renderOrganizeGrid();
});

document.querySelectorAll('input[name="org-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
        const mode = document.querySelector('input[name="org-mode"]:checked').value;
        document.getElementById("org-range-box").classList.toggle("hidden", mode !== "split_range");
        document.getElementById("org-pages-grid").classList.toggle("hidden", mode !== "custom_order");
    });
});

document.getElementById("org-submit-btn").addEventListener("click", async () => {
    if (!orgFile) return;
    const btn = document.getElementById("org-submit-btn");
    btn.disabled = true;
    const mode = document.querySelector('input[name="org-mode"]:checked').value;

    const fd = new FormData();
    fd.append("file", orgFile);
    fd.append("mode", mode);
    fd.append("operations", JSON.stringify(orgPagesState.map((p) => ({ page: p.page, rotate: p.rotate }))));
    fd.append("split_ranges", document.getElementById("org-split-input").value);

    try {
        showLoader("กำลังจัดเรียงและสร้างไฟล์ PDF...");
        const res = await fetch("/api/organize", { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "เกิดข้อผิดพลาด");
        }
        const blob = await res.blob();
        const isZip = res.headers.get("content-type")?.includes("zip");
        downloadBlob(blob, isZip ? "split_pages.zip" : "organized.pdf");
        showToast("ดาวน์โหลดไฟล์เรียบร้อยแล้ว!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 2. MERGE PDF
// ==========================================
let mergeFilesList = [];

setupDropzone("merge-dropzone", "merge-files", (files) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    mergeFilesList.push(...pdfs);
    renderMergeList();
});

function renderMergeList() {
    const ws = document.getElementById("merge-workspace");
    const ul = document.getElementById("merge-file-list");
    ws.classList.toggle("hidden", mergeFilesList.length === 0);
    document.getElementById("merge-count-label").textContent = `เลือกแล้ว ${mergeFilesList.length} ไฟล์`;
    ul.innerHTML = "";

    mergeFilesList.forEach((f, idx) => {
        const li = document.createElement("li");
        li.className = "file-item";
        li.innerHTML = `
            <div class="file-item-name">
                <span>#${idx + 1}</span>
                <span>📄 ${f.name}</span>
                <span style="color:#94a3b8;font-size:0.8rem">(${formatBytes(f.size)})</span>
            </div>
            <div class="page-controls">
                <button class="icon-btn" data-act="up" data-idx="${idx}">▲</button>
                <button class="icon-btn" data-act="down" data-idx="${idx}">▼</button>
                <button class="icon-btn del" data-act="del" data-idx="${idx}">✕</button>
            </div>
        `;
        ul.appendChild(li);
    });

    ul.querySelectorAll(".icon-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const act = btn.dataset.act;
            if (act === "del") mergeFilesList.splice(idx, 1);
            else if (act === "up" && idx > 0) {
                [mergeFilesList[idx - 1], mergeFilesList[idx]] = [mergeFilesList[idx], mergeFilesList[idx - 1]];
            } else if (act === "down" && idx < mergeFilesList.length - 1) {
                [mergeFilesList[idx + 1], mergeFilesList[idx]] = [mergeFilesList[idx], mergeFilesList[idx + 1]];
            }
            renderMergeList();
        });
    });
}

document.getElementById("merge-clear-btn").addEventListener("click", () => {
    mergeFilesList = [];
    renderMergeList();
});

document.getElementById("merge-submit-btn").addEventListener("click", async () => {
    if (mergeFilesList.length < 1) return;
    const btn = document.getElementById("merge-submit-btn");
    btn.disabled = true;
    const fd = new FormData();
    mergeFilesList.forEach((f) => fd.append("files", f));

    try {
        showLoader("กำลังรวมไฟล์ PDF...");
        const res = await fetch("/api/merge", { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "เกิดข้อผิดพลาด");
        }
        const blob = await res.blob();
        downloadBlob(blob, "merged_document.pdf");
        showToast("รวมไฟล์ PDF สำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 3. SMART WATERMARK REMOVER (Mouse + Touch Support)
// ==========================================
let rmwmFile = null;
let rmwmPages = [];
let rmwmCurrentPage = 0;
let rmwmRegions = [];
let rmwmBaseImage = new Image();
let isDrawingRegion = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };

const rmwmCanvas = document.getElementById("rmwm-canvas");
const rmwmCtx = rmwmCanvas.getContext("2d");

setupDropzone("rmwm-dropzone", "rmwm-file", async (files) => {
    rmwmFile = files[0];
    await loadRmwmFile(rmwmFile);
});

document.getElementById("rmwm-change-file").addEventListener("click", () => {
    document.getElementById("rmwm-file").click();
});

async function loadRmwmFile(file) {
    showLoader("กำลังวิเคราะห์ไฟล์และตรวจหาลายน้ำ...");
    const fd = new FormData();
    fd.append("file", file);

    try {
        const res = await fetch("/api/inspect", { method: "POST", body: fd });
        if (!res.ok) throw new Error("ไม่สามารถเปิดไฟล์ PDF ได้");
        const data = await res.json();

        document.getElementById("rmwm-dropzone").classList.add("hidden");
        document.getElementById("rmwm-workspace").classList.remove("hidden");
        document.getElementById("rmwm-file-info").textContent = `📄 ${data.filename} (${data.page_count} หน้า)`;
        document.getElementById("rmwm-after-box").classList.add("hidden");

        rmwmPages = data.pages || [];
        rmwmCurrentPage = 0;
        rmwmRegions = [];
        updateRegionCount();

        const chipsBox = document.getElementById("rmwm-detected-chips");
        chipsBox.innerHTML = "";
        if (data.repeated_texts && data.repeated_texts.length > 0) {
            const label = document.createElement("div");
            label.style.width = "100%";
            label.style.fontSize = "0.78rem";
            label.style.color = "#94a3b8";
            label.textContent = "💡 ข้อความที่พบซ้ำในไฟล์ (คลิกเพื่อเพิ่มเป็นคำที่ต้องการลบ):";
            chipsBox.appendChild(label);

            data.repeated_texts.forEach((item) => {
                const chip = document.createElement("span");
                chip.className = "chip";
                chip.textContent = `"${item.text}" (${item.count} หน้า)`;
                chip.addEventListener("click", () => {
                    const input = document.getElementById("rmwm-target-text");
                    const current = input.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                    if (!current.includes(item.text)) {
                        current.push(item.text);
                        input.value = current.join(", ");
                    }
                });
                chipsBox.appendChild(chip);
            });
        }

        loadRmwmCanvasPage();
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
    }
}

function loadRmwmCanvasPage() {
    if (!rmwmPages.length) return;
    const p = rmwmPages[rmwmCurrentPage];
    document.getElementById("rmwm-page-indicator").textContent = `${rmwmCurrentPage + 1} / ${rmwmPages.length}`;
    rmwmBaseImage.onload = () => {
        rmwmCanvas.width = rmwmBaseImage.width;
        rmwmCanvas.height = rmwmBaseImage.height;
        drawRmwmCanvas();
    };
    rmwmBaseImage.src = p.thumbnail;
}

function drawRmwmCanvas() {
    rmwmCtx.clearRect(0, 0, rmwmCanvas.width, rmwmCanvas.height);
    rmwmCtx.drawImage(rmwmBaseImage, 0, 0);

    rmwmCtx.strokeStyle = "#ec4899";
    rmwmCtx.lineWidth = 2;
    rmwmCtx.fillStyle = "rgba(236, 72, 153, 0.25)";

    rmwmRegions.forEach((r) => {
        const rx = r.x * rmwmCanvas.width;
        const ry = r.y * rmwmCanvas.height;
        const rw = r.w * rmwmCanvas.width;
        const rh = r.h * rmwmCanvas.height;
        rmwmCtx.fillRect(rx, ry, rw, rh);
        rmwmCtx.strokeRect(rx, ry, rw, rh);
    });

    if (isDrawingRegion) {
        const x = Math.min(dragStart.x, dragCurrent.x);
        const y = Math.min(dragStart.y, dragCurrent.y);
        const w = Math.abs(dragCurrent.x - dragStart.x);
        const h = Math.abs(dragCurrent.y - dragStart.y);
        rmwmCtx.fillRect(x, y, w, h);
        rmwmCtx.strokeRect(x, y, w, h);
    }
}

function getPointerCoords(clientX, clientY) {
    const rect = rmwmCanvas.getBoundingClientRect();
    const scaleX = rmwmCanvas.width / rect.width;
    const scaleY = rmwmCanvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
    };
}

function finishRegionDrawing() {
    if (!isDrawingRegion) return;
    isDrawingRegion = false;
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    if (w > 8 && h > 8 && rmwmCanvas.width > 0 && rmwmCanvas.height > 0) {
        rmwmRegions.push({
            x: x / rmwmCanvas.width,
            y: y / rmwmCanvas.height,
            w: w / rmwmCanvas.width,
            h: h / rmwmCanvas.height,
        });
        updateRegionCount();
    }
    drawRmwmCanvas();
}

// Mouse Events
rmwmCanvas.addEventListener("mousedown", (e) => {
    isDrawingRegion = true;
    dragStart = getPointerCoords(e.clientX, e.clientY);
    dragCurrent = { ...dragStart };
});
rmwmCanvas.addEventListener("mousemove", (e) => {
    if (!isDrawingRegion) return;
    dragCurrent = getPointerCoords(e.clientX, e.clientY);
    drawRmwmCanvas();
});
window.addEventListener("mouseup", finishRegionDrawing);

// Touch Events (iOS / Android / Tablet Stylus)
rmwmCanvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    isDrawingRegion = true;
    const t = e.touches[0];
    dragStart = getPointerCoords(t.clientX, t.clientY);
    dragCurrent = { ...dragStart };
}, { passive: false });

rmwmCanvas.addEventListener("touchmove", (e) => {
    if (!isDrawingRegion || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    dragCurrent = getPointerCoords(t.clientX, t.clientY);
    drawRmwmCanvas();
}, { passive: false });

window.addEventListener("touchend", finishRegionDrawing);

function updateRegionCount() {
    document.getElementById("rmwm-region-count").textContent = rmwmRegions.length;
}

document.getElementById("rmwm-clear-regions").addEventListener("click", () => {
    rmwmRegions = [];
    updateRegionCount();
    drawRmwmCanvas();
});

document.getElementById("rmwm-prev-page").addEventListener("click", () => {
    if (rmwmCurrentPage > 0) {
        rmwmCurrentPage--;
        loadRmwmCanvasPage();
    }
});

document.getElementById("rmwm-next-page").addEventListener("click", () => {
    if (rmwmCurrentPage < rmwmPages.length - 1) {
        rmwmCurrentPage++;
        loadRmwmCanvasPage();
    }
});

document.getElementById("rmwm-color-filter").addEventListener("change", (e) => {
    document.getElementById("rmwm-threshold-box").classList.toggle("hidden", !e.target.checked);
});

document.getElementById("rmwm-threshold").addEventListener("input", (e) => {
    document.getElementById("rmwm-thresh-val").textContent = e.target.value;
});

function buildRmwmFormData() {
    const fd = new FormData();
    fd.append("file", rmwmFile);
    fd.append("page_index", rmwmCurrentPage);
    fd.append("page_range", document.getElementById("rmwm-page-range").value || "all");
    fd.append("remove_annots_and_layers", document.getElementById("rmwm-auto-layer").checked);
    fd.append("target_text", document.getElementById("rmwm-target-text").value);
    fd.append("regions_json", JSON.stringify(rmwmRegions));
    fd.append("use_color_filter", document.getElementById("rmwm-color-filter").checked);
    fd.append("lightness_threshold", document.getElementById("rmwm-threshold").value);
    fd.append("fill_color", document.getElementById("rmwm-fill-color").value);
    return fd;
}

document.getElementById("rmwm-preview-btn").addEventListener("click", async () => {
    if (!rmwmFile) return;
    const btn = document.getElementById("rmwm-preview-btn");
    btn.disabled = true;
    try {
        showLoader("กำลังสร้างภาพตัวอย่างหลังลบลายน้ำ...");
        const res = await fetch("/api/watermark/preview-remove", {
            method: "POST",
            body: buildRmwmFormData(),
        });
        if (!res.ok) throw new Error("สร้างตัวอย่างไม่สำเร็จ");
        const data = await res.json();
        document.getElementById("rmwm-after-img").src = data.preview;
        document.getElementById("rmwm-after-box").classList.remove("hidden");
        showToast("แสดงตัวอย่างผลลัพธ์ด้านล่างภาพแล้ว!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

document.getElementById("rmwm-submit-btn").addEventListener("click", async () => {
    if (!rmwmFile) return;
    const btn = document.getElementById("rmwm-submit-btn");
    btn.disabled = true;
    try {
        showLoader("กำลังลบลายน้ำออกจากไฟล์ PDF...");
        const res = await fetch("/api/watermark/remove", {
            method: "POST",
            body: buildRmwmFormData(),
        });
        if (!res.ok) throw new Error("เกิดข้อผิดพลาดในการลบลายน้ำ");
        const blob = await res.blob();
        downloadBlob(blob, "watermark_removed.pdf");
        showToast("ลบลายน้ำสำเร็จและดาวน์โหลดไฟล์แล้ว!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 4. ADD WATERMARK
// ==========================================
let addwmFile = null;
setupDropzone("addwm-dropzone", "addwm-file", (files) => {
    addwmFile = files[0];
    document.getElementById("addwm-dropzone").classList.add("hidden");
    document.getElementById("addwm-workspace").classList.remove("hidden");
    document.getElementById("addwm-file-info").textContent = `📄 ${addwmFile.name} (${formatBytes(addwmFile.size)})`;
});

document.getElementById("addwm-change-file").addEventListener("click", () => {
    document.getElementById("addwm-file").click();
});

document.querySelectorAll('input[name="addwm-type"]').forEach((r) => {
    r.addEventListener("change", () => {
        const t = document.querySelector('input[name="addwm-type"]:checked').value;
        document.getElementById("addwm-text-controls").classList.toggle("hidden", t !== "text");
        document.getElementById("addwm-image-controls").classList.toggle("hidden", t !== "image");
    });
});

["size", "angle", "opacity", "scale"].forEach((key) => {
    const el = document.getElementById(`addwm-${key}`);
    if (el) {
        el.addEventListener("input", (e) => {
            document.getElementById(`addwm-${key}-val`).textContent = e.target.value;
        });
    }
});

document.getElementById("addwm-submit-btn").addEventListener("click", async () => {
    if (!addwmFile) return;
    const btn = document.getElementById("addwm-submit-btn");
    btn.disabled = true;

    const wmType = document.querySelector('input[name="addwm-type"]:checked').value;
    const fd = new FormData();
    fd.append("file", addwmFile);
    fd.append("wm_type", wmType);
    fd.append("text", document.getElementById("addwm-text").value);
    fd.append("font_size", document.getElementById("addwm-size").value);
    fd.append("angle", document.getElementById("addwm-angle").value);
    fd.append("color", document.getElementById("addwm-color").value);
    fd.append("opacity", parseFloat(document.getElementById("addwm-opacity").value) / 100.0);
    fd.append("position", document.getElementById("addwm-position").value);
    fd.append("page_range", document.getElementById("addwm-pages").value || "all");
    fd.append("image_scale", parseFloat(document.getElementById("addwm-scale").value) / 100.0);

    const imgInput = document.getElementById("addwm-img-file");
    if (wmType === "image" && imgInput.files[0]) {
        fd.append("wm_image", imgInput.files[0]);
    }

    try {
        showLoader("กำลังใส่ลายน้ำลงใน PDF...");
        const res = await fetch("/api/watermark/add", { method: "POST", body: fd });
        if (!res.ok) throw new Error("ใส่ลายน้ำไม่สำเร็จ");
        const blob = await res.blob();
        downloadBlob(blob, "watermarked.pdf");
        showToast("ใส่ลายน้ำและดาวน์โหลดเรียบร้อย!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 5. COMPRESS PDF
// ==========================================
let compFile = null;
setupDropzone("comp-dropzone", "comp-file", (files) => {
    compFile = files[0];
    document.getElementById("comp-dropzone").classList.add("hidden");
    document.getElementById("comp-workspace").classList.remove("hidden");
    document.getElementById("comp-file-info").textContent = `📄 ${compFile.name} (ขนาดเดิม: ${formatBytes(compFile.size)})`;
    document.getElementById("comp-result-banner").classList.add("hidden");
});

document.getElementById("comp-change-file").addEventListener("click", () => {
    document.getElementById("comp-file").click();
});

document.getElementById("comp-submit-btn").addEventListener("click", async () => {
    if (!compFile) return;
    const btn = document.getElementById("comp-submit-btn");
    btn.disabled = true;

    const level = document.querySelector('input[name="comp-level"]:checked').value;
    const fd = new FormData();
    fd.append("file", compFile);
    fd.append("level", level);

    try {
        showLoader("กำลังบีบอัดขนาดไฟล์ PDF...");
        const res = await fetch("/api/compress", { method: "POST", body: fd });
        if (!res.ok) throw new Error("บีบอัดไฟล์ไม่สำเร็จ");

        const orig = parseInt(res.headers.get("X-Original-Size") || compFile.size, 10);
        const comp = parseInt(res.headers.get("X-Compressed-Size") || "0", 10);
        const blob = await res.blob();
        const finalSize = comp || blob.size;
        const savedPct = orig > 0 ? Math.max(0, (((orig - finalSize) / orig) * 100).toFixed(1)) : 0;

        const banner = document.getElementById("comp-result-banner");
        banner.innerHTML = `✅ บีบอัดสำเร็จ! ขนาดเดิม <strong>${formatBytes(orig)}</strong> ➔ ขนาดใหม่ <strong>${formatBytes(finalSize)}</strong> (ประหยัดพื้นที่ <strong>${savedPct}%</strong>)`;
        banner.classList.remove("hidden");

        downloadBlob(blob, `compressed_${compFile.name}`);
        showToast("บีบอัดและดาวน์โหลดไฟล์สำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 6. PDF <-> OFFICE (Word / Excel / Text)
// ==========================================
let p2oFile = null;
let o2pFile = null;

document.querySelectorAll('input[name="office-dir"]').forEach((r) => {
    r.addEventListener("change", () => {
        const dir = document.querySelector('input[name="office-dir"]:checked').value;
        document.getElementById("panel-pdf2office").classList.toggle("hidden", dir !== "pdf2office");
        document.getElementById("panel-office2pdf").classList.toggle("hidden", dir !== "office2pdf");
    });
});

setupDropzone("p2o-dropzone", "p2o-file", (files) => {
    p2oFile = files[0];
    document.getElementById("p2o-filename").textContent = `📄 เลือกแล้ว: ${p2oFile.name} (${formatBytes(p2oFile.size)})`;
});

setupDropzone("o2p-dropzone", "o2p-file", (files) => {
    o2pFile = files[0];
    document.getElementById("o2p-filename").textContent = `📝 เลือกแล้ว: ${o2pFile.name} (${formatBytes(o2pFile.size)})`;
});

document.getElementById("p2o-submit-btn").addEventListener("click", async () => {
    if (!p2oFile) {
        showToast("กรุณาเลือกไฟล์ PDF ก่อน", true);
        return;
    }
    const btn = document.getElementById("p2o-submit-btn");
    btn.disabled = true;
    const fmt = document.getElementById("p2o-format").value;

    const fd = new FormData();
    fd.append("file", p2oFile);
    fd.append("target_format", fmt);
    fd.append("page_range", document.getElementById("p2o-pages").value || "all");

    try {
        showLoader(`กำลังแปลง PDF เป็น .${fmt.toUpperCase()} ...`);
        const res = await fetch("/api/pdf-to-office", { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "แปลงไฟล์ไม่สำเร็จ");
        }
        const blob = await res.blob();
        const baseName = p2oFile.name.replace(/\.pdf$/i, "");
        downloadBlob(blob, `${baseName}.${fmt}`);
        showToast(`แปลงเป็น .${fmt.toUpperCase()} สำเร็จ!`);
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

document.getElementById("o2p-submit-btn").addEventListener("click", async () => {
    if (!o2pFile) {
        showToast("กรุณาเลือกไฟล์เอกสารก่อน", true);
        return;
    }
    const btn = document.getElementById("o2p-submit-btn");
    btn.disabled = true;

    const fd = new FormData();
    fd.append("file", o2pFile);

    try {
        showLoader("กำลังแปลงเอกสารเป็น PDF...");
        const res = await fetch("/api/office-to-pdf", { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "แปลงไฟล์ไม่สำเร็จ");
        }
        const blob = await res.blob();
        const baseName = o2pFile.name.replace(/\.[^.]+$/, "");
        downloadBlob(blob, `${baseName}.pdf`);
        showToast("แปลงเป็น PDF สำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 7. PDF <-> IMAGES
// ==========================================
let p2iFile = null;
let i2pFiles = [];

document.querySelectorAll('input[name="img-dir"]').forEach((r) => {
    r.addEventListener("change", () => {
        const dir = document.querySelector('input[name="img-dir"]:checked').value;
        document.getElementById("panel-pdf2img").classList.toggle("hidden", dir !== "pdf2img");
        document.getElementById("panel-img2pdf").classList.toggle("hidden", dir !== "img2pdf");
    });
});

setupDropzone("p2i-dropzone", "p2i-file", (files) => {
    p2iFile = files[0];
    document.getElementById("p2i-filename").textContent = `📄 เลือกแล้ว: ${p2iFile.name} (${formatBytes(p2iFile.size)})`;
});

setupDropzone("i2p-dropzone", "i2p-files", (files) => {
    i2pFiles = files;
    document.getElementById("i2p-filename").textContent = `🖼️ เลือกรูปภาพแล้ว ${i2pFiles.length} รูป`;
});

document.getElementById("p2i-submit-btn").addEventListener("click", async () => {
    if (!p2iFile) {
        showToast("กรุณาเลือกไฟล์ PDF ก่อน", true);
        return;
    }
    const btn = document.getElementById("p2i-submit-btn");
    btn.disabled = true;
    const fmt = document.getElementById("p2i-format").value;

    const fd = new FormData();
    fd.append("file", p2iFile);
    fd.append("fmt", fmt);
    fd.append("dpi", document.getElementById("p2i-dpi").value);
    fd.append("page_range", document.getElementById("p2i-pages").value || "all");

    try {
        showLoader("กำลังแปลงหน้า PDF เป็นรูปภาพ...");
        const res = await fetch("/api/pdf-to-images", { method: "POST", body: fd });
        if (!res.ok) throw new Error("แปลงรูปภาพไม่สำเร็จ");
        const blob = await res.blob();
        const isZip = res.headers.get("content-type")?.includes("zip");
        downloadBlob(blob, isZip ? `pdf_images_${fmt}.zip` : `page_1.${fmt}`);
        showToast("แปลงเป็นรูปภาพสำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

document.getElementById("i2p-submit-btn").addEventListener("click", async () => {
    if (!i2pFiles.length) {
        showToast("กรุณาเลือกรูปภาพอย่างน้อย 1 รูป", true);
        return;
    }
    const btn = document.getElementById("i2p-submit-btn");
    btn.disabled = true;

    const fd = new FormData();
    i2pFiles.forEach((f) => fd.append("files", f));
    fd.append("page_size", document.getElementById("i2p-size").value);
    fd.append("margin", document.getElementById("i2p-margin").value);

    try {
        showLoader("กำลังรวมรูปภาพเป็นไฟล์ PDF...");
        const res = await fetch("/api/images-to-pdf", { method: "POST", body: fd });
        if (!res.ok) throw new Error("สร้างไฟล์ PDF ไม่สำเร็จ");
        const blob = await res.blob();
        downloadBlob(blob, "images_combined.pdf");
        showToast("สร้างไฟล์ PDF จากรูปภาพสำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});

// ==========================================
// 8. OCR SCANNER (Thai + English)
// ==========================================
let ocrFile = null;
setupDropzone("ocr-dropzone", "ocr-file", (files) => {
    ocrFile = files[0];
    document.getElementById("ocr-filename").textContent = `🔍 เลือกแล้ว: ${ocrFile.name} (${formatBytes(ocrFile.size)})`;
});

document.getElementById("ocr-start-btn").addEventListener("click", async () => {
    if (!ocrFile) {
        showToast("กรุณาเลือกไฟล์ PDF หรือรูปภาพก่อน", true);
        return;
    }
    const btn = document.getElementById("ocr-start-btn");
    btn.disabled = true;

    const lang = document.getElementById("ocr-lang").value;
    const pagesRange = document.getElementById("ocr-pages").value || "1-5";
    const progressBox = document.getElementById("ocr-progress-box");
    const statusText = document.getElementById("ocr-status-text");
    const progressBar = document.getElementById("ocr-progress-bar");
    const resultBox = document.getElementById("ocr-result-box");
    const outputArea = document.getElementById("ocr-output-text");

    progressBox.classList.remove("hidden");
    resultBox.classList.remove("hidden");
    outputArea.value = "";
    progressBar.style.width = "10%";
    statusText.textContent = "กำลังเรนเดอร์หน้าเอกสารความละเอียดสูง...";

    try {
        const fd = new FormData();
        fd.append("file", ocrFile);
        fd.append("page_range", pagesRange);
        fd.append("dpi", 220);

        const res = await fetch("/api/ocr-prepare", { method: "POST", body: fd });
        if (!res.ok) throw new Error("ไม่สามารถเตรียมภาพสำหรับ OCR ได้");
        const data = await res.json();
        const pages = data.pages || [];

        let combinedOutput = [];
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            statusText.textContent = `กำลังอ่านตัวอักษร OCR หน้า ${p.page_number} (${i + 1}/${pages.length})...`;

            const workerRes = await Tesseract.recognize(p.image, lang, {
                logger: (m) => {
                    if (m.status === "recognizing text") {
                        const pagePct = ((i + m.progress) / pages.length) * 100;
                        progressBar.style.width = `${Math.min(100, Math.round(pagePct))}%`;
                    }
                },
            });

            const ocrTxt = (workerRes.data.text || "").trim();
            let block = `=== หน้า ${p.page_number} ===\n`;
            if (p.embedded_text && p.embedded_text.length > ocrTxt.length) {
                block += `[ข้อความดิจิทัลใน PDF]:\n${p.embedded_text}\n\n[ข้อความจาก OCR]:\n${ocrTxt}\n`;
            } else {
                block += `${ocrTxt || p.embedded_text || "(ไม่พบข้อความ)"}\n`;
            }
            combinedOutput.push(block);
            outputArea.value = combinedOutput.join("\n");
        }

        progressBar.style.width = "100%";
        statusText.textContent = `✅ สแกน OCR เสร็จสมบูรณ์ (${pages.length} หน้า)`;
        showToast("ดึงข้อความ OCR สำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
        statusText.textContent = `เกิดข้อผิดพลาด: ${e.message}`;
    } finally {
        btn.disabled = false;
    }
});

document.getElementById("ocr-copy-btn").addEventListener("click", () => {
    const txt = document.getElementById("ocr-output-text").value;
    navigator.clipboard.writeText(txt);
    showToast("คัดลอกข้อความลงคลิปบอร์ดแล้ว!");
});

document.getElementById("ocr-download-txt").addEventListener("click", () => {
    const txt = document.getElementById("ocr-output-text").value;
    const blob = new Blob(["\uFEFF" + txt], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, "ocr_extracted_text.txt");
});

// ==========================================
// 9. SECURITY (PROTECT / UNLOCK)
// ==========================================
let secFile = null;
setupDropzone("sec-dropzone", "sec-file", (files) => {
    secFile = files[0];
    document.getElementById("sec-filename").textContent = `🔒 เลือกแล้ว: ${secFile.name} (${formatBytes(secFile.size)})`;
});

document.querySelectorAll('input[name="sec-mode"]').forEach((r) => {
    r.addEventListener("change", () => {
        const mode = document.querySelector('input[name="sec-mode"]:checked').value;
        document.getElementById("sec-pw-label").textContent =
            mode === "protect" ? "ตั้งรหัสผ่านสำหรับเปิดไฟล์ (Password)" : "กรอกรหัสผ่านเดิมของไฟล์เพื่อปลดล็อก";
    });
});

document.getElementById("sec-submit-btn").addEventListener("click", async () => {
    if (!secFile) {
        showToast("กรุณาเลือกไฟล์ PDF ก่อน", true);
        return;
    }
    const pw = document.getElementById("sec-password").value;
    if (!pw) {
        showToast("กรุณากรอกรหัสผ่าน", true);
        return;
    }

    const btn = document.getElementById("sec-submit-btn");
    btn.disabled = true;
    const mode = document.querySelector('input[name="sec-mode"]:checked').value;

    const fd = new FormData();
    fd.append("file", secFile);
    fd.append("mode", mode);
    fd.append("password", pw);

    try {
        showLoader(mode === "protect" ? "กำลังเข้ารหัสล็อกไฟล์ PDF..." : "กำลังปลดล็อกรหัสผ่าน PDF...");
        const res = await fetch("/api/security", { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "ดำเนินการไม่สำเร็จ");
        }
        const blob = await res.blob();
        downloadBlob(blob, mode === "protect" ? `protected_${secFile.name}` : `unlocked_${secFile.name}`);
        showToast(mode === "protect" ? "ล็อกรหัสผ่าน PDF สำเร็จ!" : "ปลดล็อกรหัสผ่าน PDF สำเร็จ!");
    } catch (e) {
        showToast(e.message, true);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
});
