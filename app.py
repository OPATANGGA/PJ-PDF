import io
import json
import os
import re
import tempfile
import zipfile
from pathlib import Path
from typing import List, Optional

import pymupdf as fitz
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
import pdfplumber
from docx import Document
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pdf2docx import Converter
from PIL import Image, ImageEnhance, ImageOps

app = FastAPI(title="PDF Studio Pro - All-in-One PDF Toolkit")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Original-Size", "X-Compressed-Size", "X-Removed-Count", "Content-Disposition"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)


def get_thai_font_path() -> Optional[str]:
    """Find a Thai-capable TrueType font across Windows, macOS, and Linux."""
    candidates = [
        # Windows
        r"C:\Windows\Fonts\leelawui.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
        r"C:\Windows\Fonts\angsana.ttc",
        r"C:\Windows\Fonts\cordia.ttc",
        r"C:\Windows\Fonts\arialuni.ttf",
        # macOS
        "/System/Library/Fonts/Supplemental/Thonburi.ttc",
        "/System/Library/Fonts/Thonburi.ttc",
        "/System/Library/Fonts/Supplemental/Ayuthaya.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        # Linux (Ubuntu / Debian / Fedora / Alpine)
        "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansThai-Regular.ttf",
        "/usr/share/fonts/truetype/tlwg/Waree.ttf",
        "/usr/share/fonts/truetype/tlwg/Loma.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def get_local_ip() -> str:
    """Detect local network LAN IP so phones/tablets/other PCs on Wi-Fi can connect."""
    import socket

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"



def hex_to_rgb01(hex_str: str):
    hex_str = hex_str.lstrip("#")
    if len(hex_str) != 6:
        return (0.5, 0.5, 0.5)
    return tuple(int(hex_str[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def hex_to_rgb255(hex_str: str):
    hex_str = hex_str.lstrip("#")
    if len(hex_str) != 6:
        return (200, 200, 200)
    return tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))


def parse_page_ranges(range_str: str, max_pages: int) -> List[int]:
    """Parse '1-3, 5, 8-10' (1-indexed) into sorted 0-indexed page numbers."""
    if not range_str or not range_str.strip() or range_str.strip().lower() == "all":
        return list(range(max_pages))
    pages = set()
    parts = [p.strip() for p in range_str.split(",") if p.strip()]
    for part in parts:
        if "-" in part:
            bounds = part.split("-", 1)
            try:
                start = max(1, int(bounds[0].strip()))
                end = min(max_pages, int(bounds[1].strip()))
                for p in range(start, end + 1):
                    pages.add(p - 1)
            except ValueError:
                continue
        else:
            try:
                p = int(part)
                if 1 <= p <= max_pages:
                    pages.add(p - 1)
            except ValueError:
                continue
    return sorted(pages)


@app.post("/api/inspect")
async def inspect_pdf(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    max_thumbs: int = Form(100),
):
    """Inspect a PDF file: returns metadata, page thumbnails, and detected repeated text candidates."""
    data = await file.read()
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ไม่สามารถเปิดไฟล์ PDF ได้: {str(e)}")

    if doc.is_encrypted:
        if password:
            auth = doc.authenticate(password)
            if not auth:
                raise HTTPException(status_code=401, detail="รหัสผ่าน PDF ไม่ถูกต้อง")
        else:
            return JSONResponse(
                {
                    "encrypted": True,
                    "page_count": 0,
                    "filename": file.filename,
                    "file_size": len(data),
                }
            )

    import base64
    from collections import Counter

    pages_info = []
    text_counter = Counter()
    total_pages = len(doc)

    for idx in range(min(total_pages, max_thumbs)):
        page = doc[idx]
        rect = page.rect
        pix = page.get_pixmap(dpi=96, alpha=False)
        img_bytes = pix.tobytes("png")
        b64_img = "data:image/png;base64," + base64.b64encode(img_bytes).decode("ascii")

        # Collect short text spans to detect repeated watermarks across pages
        blocks = page.get_text("dict").get("blocks", [])
        seen_on_page = set()
        for b in blocks:
            for line in b.get("lines", []):
                line_text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
                if 2 <= len(line_text) <= 80:
                    seen_on_page.add(line_text)
        for txt in seen_on_page:
            text_counter[txt] += 1

        pages_info.append(
            {
                "index": idx,
                "page_number": idx + 1,
                "width": round(rect.width, 1),
                "height": round(rect.height, 1),
                "rotation": page.rotation,
                "thumbnail": b64_img,
            }
        )

    repeated_texts = [
        {"text": txt, "count": cnt}
        for txt, cnt in text_counter.most_common(15)
        if cnt >= max(2, total_pages // 2) or (total_pages == 1 and cnt >= 1)
    ]

    doc.close()
    return JSONResponse(
        {
            "encrypted": False,
            "filename": file.filename,
            "file_size": len(data),
            "page_count": total_pages,
            "pages": pages_info,
            "repeated_texts": repeated_texts,
        }
    )


@app.post("/api/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    """Merge multiple PDF files into one."""
    if not files:
        raise HTTPException(status_code=400, detail="กรุณาเลือกไฟล์ PDF อย่างน้อย 1 ไฟล์")

    merged = fitz.open()
    for f in files:
        content = await f.read()
        try:
            src = fitz.open(stream=content, filetype="pdf")
            merged.insert_pdf(src)
            src.close()
        except Exception as e:
            merged.close()
            raise HTTPException(status_code=400, detail=f"ไฟล์ {f.filename} เสียหายหรือติดรหัสผ่าน: {str(e)}")

    out_bytes = merged.tobytes(garbage=3, deflate=True)
    merged.close()
    return Response(
        content=out_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="merged_document.pdf"'},
    )


@app.post("/api/organize")
async def organize_pdf(
    file: UploadFile = File(...),
    mode: str = Form("custom_order"),  # custom_order | split_range | split_every_page
    operations: str = Form("[]"),  # JSON list of {"page": 0, "rotate": 0}
    split_ranges: str = Form(""),  # e.g. "1-2, 3-5"
):
    """Reorder, rotate, delete pages, or split a PDF into multiple files."""
    data = await file.read()
    src = fitz.open(stream=data, filetype="pdf")
    total_pages = len(src)

    if mode == "custom_order":
        ops = json.loads(operations)
        if not ops:
            src.close()
            raise HTTPException(status_code=400, detail="ไม่มีหน้าที่เลือกไว้")

        out_doc = fitz.open()
        for item in ops:
            p_idx = int(item["page"])
            rot = int(item.get("rotate", 0))
            if 0 <= p_idx < total_pages:
                out_doc.insert_pdf(src, from_page=p_idx, to_page=p_idx)
                new_page = out_doc[-1]
                new_page.set_rotation((new_page.rotation + rot) % 360)

        out_bytes = out_doc.tobytes(garbage=3, deflate=True)
        out_doc.close()
        src.close()
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="organized.pdf"'},
        )

    elif mode == "split_every_page":
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i in range(total_pages):
                single = fitz.open()
                single.insert_pdf(src, from_page=i, to_page=i)
                zf.writestr(f"page_{i+1:03d}.pdf", single.tobytes(garbage=3, deflate=True))
                single.close()
        src.close()
        zip_buf.seek(0)
        return Response(
            content=zip_buf.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="split_pages.zip"'},
        )

    elif mode == "split_range":
        # If multiple comma-separated groups or extract single range into 1 PDF
        groups = [g.strip() for g in split_ranges.split(",") if g.strip()]
        if not groups:
            src.close()
            raise HTTPException(status_code=400, detail="กรุณาระบุช่วงหน้า เช่น 1-3, 4-6")

        if len(groups) == 1:
            pages = parse_page_ranges(groups[0], total_pages)
            out_doc = fitz.open()
            for p in pages:
                out_doc.insert_pdf(src, from_page=p, to_page=p)
            out_bytes = out_doc.tobytes(garbage=3, deflate=True)
            out_doc.close()
            src.close()
            return Response(
                content=out_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": 'attachment; filename="extracted_pages.pdf"'},
            )
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for idx, grp in enumerate(groups, 1):
                    pages = parse_page_ranges(grp, total_pages)
                    if not pages:
                        continue
                    part_doc = fitz.open()
                    for p in pages:
                        part_doc.insert_pdf(src, from_page=p, to_page=p)
                    safe_label = re.sub(r"[^0-9\-]", "", grp) or str(idx)
                    zf.writestr(f"part_{idx}_pages_{safe_label}.pdf", part_doc.tobytes(garbage=3, deflate=True))
                    part_doc.close()
            src.close()
            zip_buf.seek(0)
            return Response(
                content=zip_buf.getvalue(),
                media_type="application/zip",
                headers={"Content-Disposition": 'attachment; filename="split_ranges.zip"'},
            )

    src.close()
    raise HTTPException(status_code=400, detail="โหมดไม่ถูกต้อง")


@app.post("/api/pdf-to-images")
async def pdf_to_images(
    file: UploadFile = File(...),
    fmt: str = Form("png"),  # png | jpg
    dpi: int = Form(200),
    page_range: str = Form("all"),
):
    """Convert PDF pages to high-resolution PNG or JPG images."""
    data = await file.read()
    doc = fitz.open(stream=data, filetype="pdf")
    pages = parse_page_ranges(page_range, len(doc))
    if not pages:
        doc.close()
        raise HTTPException(status_code=400, detail="ไม่พบหน้าที่ระบุ")

    dpi = max(72, min(dpi, 400))
    ext = "jpg" if fmt.lower() in ("jpg", "jpeg") else "png"
    pil_fmt = "JPEG" if ext == "jpg" else "PNG"

    if len(pages) == 1:
        page = doc[pages[0]]
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        img_bytes = pix.tobytes("jpeg" if ext == "jpg" else "png")
        doc.close()
        return Response(
            content=img_bytes,
            media_type=f"image/{'jpeg' if ext == 'jpg' else 'png'}",
            headers={"Content-Disposition": f'attachment; filename="page_{pages[0]+1}.{ext}"'},
        )

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p_idx in pages:
            page = doc[p_idx]
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            img_bytes = pix.tobytes("jpeg" if ext == "jpg" else "png")
            zf.writestr(f"page_{p_idx+1:03d}.{ext}", img_bytes)

    doc.close()
    zip_buf.seek(0)
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="pdf_images_{ext}.zip"'},
    )


@app.post("/api/images-to-pdf")
async def images_to_pdf(
    files: List[UploadFile] = File(...),
    page_size: str = Form("a4_portrait"),  # original | a4_portrait | a4_landscape
    margin: int = Form(20),
):
    """Convert one or more images into a single PDF document."""
    if not files:
        raise HTTPException(status_code=400, detail="กรุณาเลือกรูปภาพอย่างน้อย 1 รูป")

    out_doc = fitz.open()
    for f in files:
        raw = await f.read()
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            rgba = img.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[3])
            img = bg
        else:
            img = img.convert("RGB")

        img_buf = io.BytesIO()
        img.save(img_buf, format="JPEG", quality=92)
        img_bytes = img_buf.getvalue()
        img_w, img_h = img.size

        if page_size == "original":
            page = out_doc.new_page(width=img_w, height=img_h)
            page.insert_image(fitz.Rect(0, 0, img_w, img_h), stream=img_bytes)
        else:
            pw, ph = (595.0, 842.0) if page_size == "a4_portrait" else (842.0, 595.0)
            page = out_doc.new_page(width=pw, height=ph)
            m = max(0, min(margin, 100))
            avail_w = pw - 2 * m
            avail_h = ph - 2 * m
            scale = min(avail_w / img_w, avail_h / img_h)
            draw_w = img_w * scale
            draw_h = img_h * scale
            x0 = m + (avail_w - draw_w) / 2
            y0 = m + (avail_h - draw_h) / 2
            page.insert_image(fitz.Rect(x0, y0, x0 + draw_w, y0 + draw_h), stream=img_bytes)

    out_bytes = out_doc.tobytes(garbage=3, deflate=True)
    out_doc.close()
    return Response(
        content=out_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="images_to_pdf.pdf"'},
    )


@app.post("/api/pdf-to-office")
async def pdf_to_office(
    file: UploadFile = File(...),
    target_format: str = Form("docx"),  # docx | xlsx | txt
    page_range: str = Form("all"),
):
    """Convert PDF to Word (.docx), Excel (.xlsx), or Text (.txt)."""
    data = await file.read()
    fmt = target_format.lower().strip()

    if fmt == "txt":
        doc = fitz.open(stream=data, filetype="pdf")
        pages = parse_page_ranges(page_range, len(doc))
        text_parts = []
        for p in pages:
            page_text = doc[p].get_text("text")
            text_parts.append(f"--- หน้า {p + 1} ---\n{page_text.strip()}\n")
        doc.close()
        full_text = "\n".join(text_parts)
        return Response(
            content=full_text.encode("utf-8-sig"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="extracted_text.txt"'},
        )

    elif fmt == "docx":
        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, "input.pdf")
            docx_path = os.path.join(tmpdir, "output.docx")
            with open(pdf_path, "wb") as f:
                f.write(data)

            doc_check = fitz.open(pdf_path)
            pages = parse_page_ranges(page_range, len(doc_check))
            doc_check.close()

            cv = Converter(pdf_path)
            cv.convert(docx_path, pages=pages)
            cv.close()

            with open(docx_path, "rb") as f:
                docx_bytes = f.read()

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": 'attachment; filename="converted_document.docx"'},
        )

    elif fmt == "xlsx":
        wb = openpyxl.Workbook()
        # remove default sheet if we create sheets
        default_ws = wb.active
        default_ws.title = "Page_1"

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = parse_page_ranges(page_range, len(pdf.pages))
            first_sheet = True
            for p_idx in pages:
                p_obj = pdf.pages[p_idx]
                ws = default_ws if first_sheet else wb.create_sheet(title=f"Page_{p_idx + 1}")
                if first_sheet:
                    ws.title = f"Page_{p_idx + 1}"
                    first_sheet = False

                tables = p_obj.extract_tables()
                if tables:
                    row_cursor = 1
                    for t_idx, table in enumerate(tables, 1):
                        for r_idx, row in enumerate(table):
                            for c_idx, cell_val in enumerate(row, 1):
                                cleaned = (cell_val or "").strip()
                                cell = ws.cell(row=row_cursor, column=c_idx, value=cleaned)
                                if r_idx == 0:
                                    cell.font = Font(bold=True)
                                    cell.fill = PatternFill("solid", fgColor="E2E8F0")
                            row_cursor += 1
                        row_cursor += 1
                else:
                    # Fallback: extract lines and split by multi-space or tabs
                    text = p_obj.extract_text() or ""
                    for r_idx, line in enumerate(text.splitlines(), 1):
                        cols = re.split(r"\s{2,}|\t", line.strip())
                        for c_idx, val in enumerate(cols, 1):
                            ws.cell(row=r_idx, column=c_idx, value=val)

        out_buf = io.BytesIO()
        wb.save(out_buf)
        return Response(
            content=out_buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="converted_tables.xlsx"'},
        )

    raise HTTPException(status_code=400, detail="รูปแบบไฟล์เป้าหมายไม่รองรับ")


@app.post("/api/office-to-pdf")
async def office_to_pdf(file: UploadFile = File(...)):
    """Convert Word (.docx), Excel (.xlsx), or Text (.txt) into a PDF with full Thai font support."""
    data = await file.read()
    filename = (file.filename or "file.txt").lower()
    ext = os.path.splitext(filename)[1]

    html_parts = [
        """
        <style>
            body { font-family: sans-serif; font-size: 11pt; line-height: 1.5; color: #1e293b; }
            h1 { font-size: 18pt; color: #0f172a; margin-bottom: 8pt; }
            h2 { font-size: 14pt; color: #1e293b; margin-bottom: 6pt; }
            p { margin-top: 0; margin-bottom: 6pt; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; font-size: 9.5pt; }
            th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; }
        </style>
        """
    ]

    import html as html_lib

    if ext == ".txt":
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("cp874", errors="replace")
        for line in text.splitlines():
            escaped = html_lib.escape(line) or "&nbsp;"
            html_parts.append(f"<p>{escaped}</p>")

    elif ext == ".docx":
        doc = Document(io.BytesIO(data))
        for para in doc.paragraphs:
            txt = html_lib.escape(para.text.strip())
            if not txt:
                continue
            style_name = (para.style.name or "").lower()
            if "heading 1" in style_name or "title" in style_name:
                html_parts.append(f"<h1>{txt}</h1>")
            elif "heading" in style_name:
                html_parts.append(f"<h2>{txt}</h2>")
            else:
                html_parts.append(f"<p>{txt}</p>")

        for table in doc.tables:
            html_parts.append("<table>")
            for r_idx, row in enumerate(table.rows):
                html_parts.append("<tr>")
                tag = "th" if r_idx == 0 else "td"
                for cell in row.cells:
                    cell_txt = html_lib.escape(cell.text.strip())
                    html_parts.append(f"<{tag}>{cell_txt}</{tag}>")
                html_parts.append("</tr>")
            html_parts.append("</table>")

    elif ext == ".xlsx":
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            html_parts.append(f"<h2>แผ่นงาน: {html_lib.escape(sheet_name)}</h2>")
            html_parts.append("<table>")
            first_row = True
            for row in ws.iter_rows(values_only=True):
                if all(v is None or str(v).strip() == "" for v in row):
                    continue
                html_parts.append("<tr>")
                tag = "th" if first_row else "td"
                first_row = False
                for val in row:
                    txt = "" if val is None else html_lib.escape(str(val))
                    html_parts.append(f"<{tag}>{txt}</{tag}>")
                html_parts.append("</tr>")
            html_parts.append("</table>")
    else:
        raise HTTPException(status_code=400, detail="รองรับเฉพาะไฟล์ .docx, .xlsx และ .txt")

    full_html = "\n".join(html_parts)

    # Render multi-page HTML Story using PyMuPDF with cross-platform Thai font archive
    archive = fitz.Archive()
    font_path = get_thai_font_path()
    font_filename = os.path.basename(font_path) if font_path else "leelawui.ttf"
    if font_path and os.path.isdir(os.path.dirname(font_path)):
        archive = fitz.Archive(os.path.dirname(font_path))

    user_css = f"""
    @font-face {{
        font-family: ThaiSans;
        src: url({font_filename});
    }}
    body, p, h1, h2, th, td {{
        font-family: ThaiSans, Tahoma, Thonburi, sans-serif;
    }}
    """
    story = fitz.Story(html=full_html, user_css=user_css, archive=archive)
    writer_buf = io.BytesIO()
    writer = fitz.DocumentWriter(writer_buf)

    mediabox = fitz.paper_rect("a4")
    where = mediabox + (36, 36, -36, -36)
    more = True
    while more:
        device = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(device)
        writer.end_page()
    writer.close()

    return Response(
        content=writer_buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="converted_from_office.pdf"'},
    )


@app.post("/api/compress")
async def compress_pdf(
    file: UploadFile = File(...),
    level: str = Form("medium"),  # low | medium | high
):
    """Compress PDF size by cleaning streams and optionally downsampling/recompressing images."""
    data = await file.read()
    orig_size = len(data)
    doc = fitz.open(stream=data, filetype="pdf")

    if level in ("medium", "high"):
        target_dpi = 140 if level == "medium" else 95
        jpg_quality = 75 if level == "medium" else 50
        try:
            doc.rewrite_images(dpi_threshold=target_dpi + 20, dpi_target=target_dpi, quality=jpg_quality, lossy=True)
        except Exception:
            pass

    out_bytes = doc.tobytes(garbage=4, deflate=True, clean=True, deflate_images=True, deflate_fonts=True)
    doc.close()

    # Never return a file larger than original if already heavily compressed
    if len(out_bytes) >= orig_size and level == "low":
        out_bytes = data

    return Response(
        content=out_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="compressed.pdf"',
            "X-Original-Size": str(orig_size),
            "X-Compressed-Size": str(len(out_bytes)),
        },
    )


@app.post("/api/watermark/add")
async def add_watermark(
    file: UploadFile = File(...),
    wm_type: str = Form("text"),  # text | image
    text: str = Form("CONFIDENTIAL / ลับเฉพาะ"),
    font_size: int = Form(42),
    color: str = Form("#64748b"),
    opacity: float = Form(0.25),
    angle: float = Form(45),
    position: str = Form("center"),  # center | tiled | header | footer
    page_range: str = Form("all"),
    wm_image: Optional[UploadFile] = File(None),
    image_scale: float = Form(0.35),
):
    """Add customizable Text (Thai/English) or Image watermark to PDF pages."""
    data = await file.read()
    doc = fitz.open(stream=data, filetype="pdf")
    pages = parse_page_ranges(page_range, len(doc))
    opacity = max(0.05, min(opacity, 1.0))

    if wm_type == "image" and wm_image is not None:
        img_raw = await wm_image.read()
        pil_img = Image.open(io.BytesIO(img_raw)).convert("RGBA")
        # Apply opacity to alpha channel
        r, g, b, a = pil_img.split()
        a = a.point(lambda p: int(p * opacity))
        pil_img = Image.merge("RGBA", (r, g, b, a))
        img_buf = io.BytesIO()
        pil_img.save(img_buf, format="PNG")
        wm_bytes = img_buf.getvalue()
        iw, ih = pil_img.size

        for p_idx in pages:
            page = doc[p_idx]
            pw, ph = page.rect.width, page.rect.height
            target_w = pw * max(0.05, min(image_scale, 0.95))
            target_h = ih * (target_w / max(iw, 1))
            if position == "header":
                x0, y0 = (pw - target_w) / 2, 24
            elif position == "footer":
                x0, y0 = (pw - target_w) / 2, ph - target_h - 24
            else:
                x0, y0 = (pw - target_w) / 2, (ph - target_h) / 2
            page.insert_image(fitz.Rect(x0, y0, x0 + target_w, y0 + target_h), stream=wm_bytes, overlay=True)

    else:
        # Render text watermark onto a crisp high-res transparent PNG via PIL or PyMuPDF font
        # Using PIL with Windows Thai font allows smooth arbitrary rotation, tiling, and exact alpha transparency!
        from PIL import ImageDraw, ImageFont

        font_path = get_thai_font_path()
        rgb = hex_to_rgb255(color)
        rgba_color = (rgb[0], rgb[1], rgb[2], int(255 * opacity))

        for p_idx in pages:
            page = doc[p_idx]
            pw, ph = int(page.rect.width), int(page.rect.height)
            scale_factor = 2  # 2x supersampling for crisp text
            canvas_w, canvas_h = pw * scale_factor, ph * scale_factor

            try:
                pil_font = (
                    ImageFont.truetype(font_path, int(font_size * scale_factor))
                    if font_path
                    else ImageFont.load_default()
                )
            except Exception:
                pil_font = ImageFont.load_default()

            overlay_img = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 0))

            # Create single stamp image
            dummy_draw = ImageDraw.Draw(overlay_img)
            bbox = dummy_draw.textbbox((0, 0), text, font=pil_font)
            tw = max(1, bbox[2] - bbox[0] + 40)
            th = max(1, bbox[3] - bbox[1] + 40)

            stamp = Image.new("RGBA", (tw, th), (255, 255, 255, 0))
            s_draw = ImageDraw.Draw(stamp)
            s_draw.text((20 - bbox[0], 20 - bbox[1]), text, font=pil_font, fill=rgba_color)
            if angle % 360 != 0:
                stamp = stamp.rotate(angle, expand=True, resample=Image.BICUBIC)

            sw, sh = stamp.size

            if position == "tiled":
                step_x = max(sw + 80, canvas_w // 3)
                step_y = max(sh + 80, canvas_h // 4)
                for y in range(-sh // 2, canvas_h, step_y):
                    for x in range(-sw // 2, canvas_w, step_x):
                        overlay_img.alpha_composite(stamp, dest=(max(0, x), max(0, y)))
            elif position == "header":
                x = max(0, (canvas_w - sw) // 2)
                y = 30 * scale_factor
                overlay_img.alpha_composite(stamp, dest=(x, y))
            elif position == "footer":
                x = max(0, (canvas_w - sw) // 2)
                y = max(0, canvas_h - sh - 30 * scale_factor)
                overlay_img.alpha_composite(stamp, dest=(x, y))
            else:
                x = max(0, (canvas_w - sw) // 2)
                y = max(0, (canvas_h - sh) // 2)
                overlay_img.alpha_composite(stamp, dest=(x, y))

            buf = io.BytesIO()
            overlay_img.save(buf, format="PNG")
            page.insert_image(page.rect, stream=buf.getvalue(), overlay=True)

    out_bytes = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return Response(
        content=out_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="watermarked.pdf"'},
    )


def _apply_watermark_removal_to_doc(
    doc: fitz.Document,
    pages: List[int],
    remove_annots_and_layers: bool,
    target_text: str,
    regions: List[dict],
    use_color_filter: bool,
    lightness_threshold: int,
    fill_color_hex: str,
) -> int:
    """Apply multi-layer watermark removal strategies to a PyMuPDF Document."""
    removed_count = 0
    fill_rgb01 = hex_to_rgb01(fill_color_hex)

    # 1. Clean Optional Content Groups (OCGs / Watermark layers) & XObject Watermarks if enabled
    if remove_annots_and_layers:
        for p_idx in pages:
            page = doc[p_idx]
            # Remove Watermark / Stamp / FreeText annotations
            annots = list(page.annots() or [])
            for annot in annots:
                page.delete_annot(annot)
                removed_count += 1

            # Inspect page images / XObjects that are full-page overlays added as watermarks
            # Specifically check if there are multiple images or transparent overlay stamps
            img_list = page.get_images(full=True)
            for img_info in img_list:
                xref = img_info[0]
                smask = img_info[1]
                # If an image has a soft-mask (transparency alpha layer often used by watermarks)
                if smask > 0:
                    try:
                        page.delete_image(xref)
                        removed_count += 1
                    except Exception:
                        pass

    # 2. Remove specific watermark text (supports comma-separated or exact phrase)
    queries = [q.strip() for q in target_text.split(",") if q.strip()] if target_text else []
    if queries:
        for p_idx in pages:
            page = doc[p_idx]
            page_redacted = False
            for q in queries:
                rects = page.search_for(q)
                for r in rects:
                    page.add_redact_annot(r, fill=fill_rgb01)
                    removed_count += 1
                    page_redacted = True
            if page_redacted:
                # Apply redactions to text only, keeping untouched images intact
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    # 3. Interactive Region Redaction / Removal (normalized 0..1 coordinates)
    if regions:
        for p_idx in pages:
            page = doc[p_idx]
            pw, ph = page.rect.width, page.rect.height
            has_reg = False
            for reg in regions:
                rx = float(reg.get("x", 0)) * pw
                ry = float(reg.get("y", 0)) * ph
                rw = float(reg.get("w", 0)) * pw
                rh = float(reg.get("h", 0)) * ph
                if rw > 1 and rh > 1:
                    rect = fitz.Rect(rx, ry, rx + rw, ry + rh)
                    page.add_redact_annot(rect, fill=fill_rgb01)
                    removed_count += 1
                    has_reg = True
            if has_reg:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

    # 4. Lightness / Color Despeckle Filter (Ideal for scanned PDFs or faint gray/colored background watermarks)
    if use_color_filter:
        thresh = max(120, min(lightness_threshold, 250))
        for p_idx in pages:
            page = doc[p_idx]
            pix = page.get_pixmap(dpi=200, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            # Vectorized pixel threshold via PIL point table on grayscale luminance
            gray = img.convert("L")
            # Pixels lighter than `thresh` (e.g. light gray watermark > 185) become pure white (255)
            mask = gray.point(lambda p: 255 if p >= thresh else 0, mode="1")
            white_bg = Image.new("RGB", img.size, (255, 255, 255))
            cleaned_img = Image.composite(white_bg, img, mask)

            buf = io.BytesIO()
            cleaned_img.save(buf, format="JPEG", quality=90)
            rect = page.rect
            page.clean_contents()
            page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)
            page.insert_image(rect, stream=buf.getvalue())
            removed_count += 1

    return removed_count


@app.post("/api/watermark/preview-remove")
async def preview_remove_watermark(
    file: UploadFile = File(...),
    page_index: int = Form(0),
    remove_annots_and_layers: bool = Form(True),
    target_text: str = Form(""),
    regions_json: str = Form("[]"),
    use_color_filter: bool = Form(False),
    lightness_threshold: int = Form(195),
    fill_color: str = Form("#ffffff"),
):
    """Preview the watermark removal result on a single page in real-time."""
    import base64

    data = await file.read()
    doc = fitz.open(stream=data, filetype="pdf")
    if len(doc) == 0:
        doc.close()
        raise HTTPException(status_code=400, detail="PDF ว่างเปล่า")

    p_idx = max(0, min(page_index, len(doc) - 1))
    regions = json.loads(regions_json or "[]")

    removed_count = _apply_watermark_removal_to_doc(
        doc=doc,
        pages=[p_idx],
        remove_annots_and_layers=remove_annots_and_layers,
        target_text=target_text,
        regions=regions,
        use_color_filter=use_color_filter,
        lightness_threshold=lightness_threshold,
        fill_color_hex=fill_color,
    )

    pix = doc[p_idx].get_pixmap(dpi=130, alpha=False)
    b64_img = "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode("ascii")
    doc.close()
    return JSONResponse({"preview": b64_img, "removed_count": removed_count})


@app.post("/api/watermark/remove")
async def remove_watermark(
    file: UploadFile = File(...),
    page_range: str = Form("all"),
    remove_annots_and_layers: bool = Form(True),
    target_text: str = Form(""),
    regions_json: str = Form("[]"),
    use_color_filter: bool = Form(False),
    lightness_threshold: int = Form(195),
    fill_color: str = Form("#ffffff"),
):
    """Remove watermarks from PDF using combined structural, text, region, and color-threshold techniques."""
    data = await file.read()
    doc = fitz.open(stream=data, filetype="pdf")
    pages = parse_page_ranges(page_range, len(doc))
    regions = json.loads(regions_json or "[]")

    removed_count = _apply_watermark_removal_to_doc(
        doc=doc,
        pages=pages,
        remove_annots_and_layers=remove_annots_and_layers,
        target_text=target_text,
        regions=regions,
        use_color_filter=use_color_filter,
        lightness_threshold=lightness_threshold,
        fill_color_hex=fill_color,
    )

    out_bytes = doc.tobytes(garbage=4, deflate=True, clean=True)
    doc.close()
    return Response(
        content=out_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="watermark_removed.pdf"',
            "X-Removed-Count": str(removed_count),
        },
    )


@app.post("/api/security")
async def pdf_security(
    file: UploadFile = File(...),
    mode: str = Form("protect"),  # protect | unlock
    password: str = Form(""),
    owner_password: Optional[str] = Form(None),
):
    """Lock (encrypt AES-256) or Unlock (decrypt) a PDF file."""
    if not password:
        raise HTTPException(status_code=400, detail="กรุณากรอกรหัสผ่าน")

    data = await file.read()
    doc = fitz.open(stream=data, filetype="pdf")

    if mode == "protect":
        owner_pw = owner_password if owner_password else password
        out_bytes = doc.tobytes(
            garbage=3,
            deflate=True,
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw=password,
            owner_pw=owner_pw,
            permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_ACCESSIBILITY,
        )
        doc.close()
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="protected.pdf"'},
        )
    else:
        if doc.is_encrypted:
            ok = doc.authenticate(password)
            if not ok:
                doc.close()
                raise HTTPException(status_code=401, detail="รหัสผ่านไม่ถูกต้อง ไม่สามารถปลดล็อกได้")
        out_bytes = doc.tobytes(garbage=3, deflate=True, encryption=fitz.PDF_ENCRYPT_NONE)
        doc.close()
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="unlocked.pdf"'},
        )


@app.post("/api/ocr-prepare")
async def ocr_prepare(
    file: UploadFile = File(...),
    page_range: str = Form("all"),
    dpi: int = Form(220),
):
    """Render PDF pages or image into high-contrast images for Thai/English OCR + extract any embedded text."""
    import base64

    data = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        doc = fitz.open(stream=data, filetype="pdf")
        pages = parse_page_ranges(page_range, len(doc))
        pages = pages[:20]  # limit batch size for responsive UI
        result_pages = []
        for p_idx in pages:
            page = doc[p_idx]
            embedded_text = page.get_text("text").strip()
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            b64_img = "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode("ascii")
            result_pages.append(
                {
                    "page_number": p_idx + 1,
                    "embedded_text": embedded_text,
                    "image": b64_img,
                }
            )
        doc.close()
        return JSONResponse({"pages": result_pages})
    else:
        # Image file uploaded directly
        img = Image.open(io.BytesIO(data)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64_img = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        return JSONResponse(
            {
                "pages": [
                    {
                        "page_number": 1,
                        "embedded_text": "",
                        "image": b64_img,
                    }
                ]
            }
        )


@app.get("/api/system-info")
async def system_info():
    """Return local LAN IP and platform info for cross-device QR Code sharing."""
    import platform
    import socket

    lan_ip = get_local_ip()
    return JSONResponse(
        {
            "lan_ip": lan_ip,
            "lan_url": f"http://{lan_ip}:8000",
            "local_url": "http://127.0.0.1:8000",
            "platform": f"{platform.system()} {platform.release()}",
            "hostname": socket.gethostname(),
        }
    )


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/manifest.json")
async def pwa_manifest():
    return FileResponse(str(STATIC_DIR / "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js")
async def pwa_sw():
    return FileResponse(str(STATIC_DIR / "sw.js"), media_type="application/javascript")


@app.get("/")
async def root():
    return FileResponse(str(STATIC_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

