"""SpatialVision AI backend: photo + click -> real-world area of that surface.
Run: uvicorn main:app --reload --port 8000
"""
import base64, json, os
import cv2, numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SpatialVision AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

A4_W, A4_H = 210.0, 297.0  # mm
_sam = None


def load(data):
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Invalid image file.")
    s = 1280 / max(img.shape[:2])
    return cv2.resize(img, None, fx=s, fy=s) if s < 1 else img


def order(p):  # TL, TR, BR, BL
    s, d = p.sum(1), np.diff(p, axis=1).ravel()
    return np.float32([p[s.argmin()], p[d.argmin()], p[s.argmax()], p[d.argmax()]])


def find_a4(img):
    """Find the A4 sheet: white-paper mask + Canny edges -> 4-corner contour with A4-like ratio."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    masks = [cv2.inRange(hsv, (0, 0, 150), (180, 70, 255)), cv2.Canny(gray, 50, 150)]
    total, best = img.shape[0] * img.shape[1], None
    for m in masks:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        for c in cv2.findContours(m, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)[0]:
            if not 0.003 * total < cv2.contourArea(c) < 0.4 * total:
                continue
            ap = cv2.approxPolyDP(c, 0.03 * cv2.arcLength(c, True), True)
            if len(ap) != 4 or not cv2.isContourConvex(ap):
                continue
            q = order(ap.reshape(4, 2).astype(np.float32))
            w = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
            h = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
            ar = max(w, h) / max(min(w, h), 1)
            if 1.15 < ar < 1.75 and (best is None or abs(ar - 1.414) < best[0]):
                best = (abs(ar - 1.414), q)
    if best is None:
        return None
    q = best[1].reshape(-1, 1, 2)
    cv2.cornerSubPix(gray, q, (7, 7), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.01))
    return q.reshape(4, 2)


def segment(img, x, y, quad, tol):
    """Select the clicked surface. Optional MobileSAM (USE_SAM=1), else colour region-growing."""
    global _sam
    if os.getenv("USE_SAM") == "1":
        try:
            from ultralytics import SAM
            _sam = _sam or SAM("mobile_sam.pt")
            m = _sam(img, points=[[x, y]], labels=[1])[0].masks.data[0].cpu().numpy()
            return cv2.resize((m * 255).astype(np.uint8), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
        except Exception as e:
            print("SAM failed, using fallback:", e)
    h, w = img.shape[:2]
    lab = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2LAB), (9, 9), 0)
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (9, 9), 0)
    edges = cv2.dilate(cv2.Canny(gray, 40, 120), np.ones((3, 3), np.uint8))  # barrier: selection cannot cross edges
    edges[max(y - 5, 0):y + 6, max(x - 5, 0):x + 6] = 0  # keep the click point free
    t = tol
    for _ in range(6):
        m = np.zeros((h + 2, w + 2), np.uint8)
        m[1:-1, 1:-1] = (edges > 0).astype(np.uint8)
        cv2.floodFill(lab.copy(), m, (x, y), 0, (2 * t, t, t), (2 * t, t, t), 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8))
        mask = (m[1:-1, 1:-1] == 255).astype(np.uint8) * 255
        if mask.sum() / 255 < 0.6 * h * w:  # leaked into the whole image -> tighten and retry
            break
        t = max(1, int(t * 0.6))
    cv2.fillPoly(mask, [quad.astype(np.int32)], 255)  # paper sheet is part of the surface
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    _, cc = cv2.connectedComponents(mask)
    return ((cc == cc[y, x]) & (cc > 0)).astype(np.uint8) * 255


@app.post("/api/measure")
async def measure(image: UploadFile = File(...), x: float = Form(...), y: float = Form(...), tol: int = Form(10)):
    img = load(await image.read())
    h, w = img.shape[:2]
    quad = find_a4(img)
    if quad is None:
        raise HTTPException(422, "A4 sheet not found. Place a full A4 sheet flat on the surface and keep all 4 corners visible.")
    px, py = min(int(x * w), w - 1), min(int(y * h), h - 1)
    mask = segment(img, px, py, quad, tol)
    cs, hi = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        raise HTTPException(422, "Could not select a surface here. Click inside the surface.")
    outer = [k for k in range(len(cs)) if hi[0][k][3] == -1]
    i = max(outer, key=lambda k: cv2.contourArea(cs[k]))
    c = cs[i]

    # homography: image plane -> real plane in mm (A4 = known size)
    H = cv2.getPerspectiveTransform(quad.astype(np.float32), np.float32([[0, 0], [A4_W, 0], [A4_W, A4_H], [0, A4_H]]))
    mm = lambda k: cv2.perspectiveTransform(k.reshape(-1, 1, 2).astype(np.float32), H)
    pts = mm(c)
    gross = cv2.contourArea(pts) / 1e6
    holes_c = [k for j, k in enumerate(cs) if hi[0][j][3] == i and cv2.contourArea(k) > 0.001 * h * w]
    holes = sum(cv2.contourArea(mm(k)) for k in holes_c) / 1e6  # windows, doors, objects inside the surface
    area_m2 = max(gross - holes, 0)
    (_, _), (rw, rh), _ = cv2.minAreaRect(pts)

    ov = img.copy()
    ov[mask > 0] = (0.55 * ov[mask > 0] + 0.45 * np.array([154, 46, 255])).astype(np.uint8)
    cv2.drawContours(ov, [c], -1, (154, 46, 255), 3)
    cv2.drawContours(ov, holes_c, -1, (246, 130, 59), 2)
    cv2.polylines(ov, [quad.astype(np.int32)], True, (246, 130, 59), 3)
    cv2.circle(ov, (px, py), 8, (0, 0, 255), -1)
    b64 = base64.b64encode(cv2.imencode(".jpg", ov, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]).decode()
    return {
        "area_m2": round(area_m2, 3),
        "gross_m2": round(gross, 3),
        "openings_m2": round(holes, 3),
        "area_sqft": round(area_m2 * 10.7639, 2),
        "perimeter_m": round(cv2.arcLength(pts, True) / 1000, 2),
        "width_m": round(max(rw, rh) / 1000, 2),
        "height_m": round(min(rw, rh) / 1000, 2),
        "overlay": "data:image/jpeg;base64," + b64,
    }


@app.post("/api/measure_polygon")
async def measure_polygon(image: UploadFile = File(...), points: str = Form(...)):
    """Manual outline: user clicks the surface corners; area comes straight from the A4 scale."""
    img = load(await image.read())
    h, w = img.shape[:2]
    quad = find_a4(img)
    if quad is None:
        raise HTTPException(422, "A4 sheet not found. Place a full A4 sheet flat on the surface and keep all 4 corners visible.")
    p = np.float32(json.loads(points)) * np.float32([w, h])
    if len(p) < 3:
        raise HTTPException(422, "Click at least 3 corner points.")
    H = cv2.getPerspectiveTransform(quad.astype(np.float32), np.float32([[0, 0], [A4_W, 0], [A4_W, A4_H], [0, A4_H]]))
    pts = cv2.perspectiveTransform(p.reshape(-1, 1, 2), H)
    area_m2 = cv2.contourArea(pts) / 1e6
    (_, _), (rw, rh), _ = cv2.minAreaRect(pts)
    poly = p.astype(np.int32)
    layer = img.copy()
    cv2.fillPoly(layer, [poly], (154, 46, 255))
    ov = cv2.addWeighted(layer, 0.45, img, 0.55, 0)
    cv2.polylines(ov, [poly], True, (154, 46, 255), 3)
    cv2.polylines(ov, [quad.astype(np.int32)], True, (246, 130, 59), 3)
    b64 = base64.b64encode(cv2.imencode(".jpg", ov, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]).decode()
    return {
        "area_m2": round(area_m2, 3), "gross_m2": round(area_m2, 3), "openings_m2": 0,
        "area_sqft": round(area_m2 * 10.7639, 2),
        "perimeter_m": round(cv2.arcLength(pts, True) / 1000, 2),
        "width_m": round(max(rw, rh) / 1000, 2), "height_m": round(min(rw, rh) / 1000, 2),
        "overlay": "data:image/jpeg;base64," + b64,
    }
