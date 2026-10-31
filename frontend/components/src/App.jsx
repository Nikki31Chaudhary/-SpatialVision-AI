import { useRef, useState } from "react";
import { Room, WallA4, WallClick, Result } from "./Art.jsx";

const SQFT = 10.7639;
const TYPES = ["Wall", "Floor", "Ceiling", "Other"];
const steps = [
  ["Place an A4 sheet", "Put one full A4 sheet flat on the surface. Its known size (210 × 297 mm) becomes the measuring scale.", <WallA4 />],
  ["Select the surface", "Upload a photo or use your camera, then click the surface you want to measure.", <WallClick />],
  ["Get the area", "The surface is isolated and converted to real-world units: area, dimensions and perimeter.", <Result />],
];
const uses = [
  ["Painting and decorating", "Calculate wall and ceiling area and estimate paint quantity before you buy."],
  ["Flooring and tiling", "Measure floors accurately and include a wastage allowance for tiles or planks."],
  ["Interior design", "Size tables, shelves, panels and other flat surfaces without a tape measure."],
  ["Property and facilities", "Document room sizes quickly for listings, inspections and maintenance."],
];
const faq = [
  ["How is the real-world scale found?", "An A4 sheet has a fixed size. We detect its four corners and compute a perspective transform (homography) that maps every pixel on that plane to millimetres."],
  ["How accurate is it?", "Accuracy depends on the sheet lying flat on the surface and the photo being taken roughly straight on; it drops at steep camera angles. We are validating results against tape-measured surfaces and will publish the error figures here."],
  ["What are the limits?", "The sheet and the surface must be on the same plane, and the surface should be flat. Curved surfaces and heavily shadowed areas can reduce accuracy."],
  ["How are windows and doors handled?", "Openings inside the selected surface are detected and can be deducted, so you get net area for painting or cladding."],
];

export default function App() {
  const [file, setFile] = useState(null);
  const [src, setSrc] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tol, setTol] = useState(10);
  const [unit, setUnit] = useState("m2");
  const [net, setNet] = useState(true);
  const [rows, setRows] = useState([]);
  const [cam, setCam] = useState(false);
  const [mode, setMode] = useState("auto");
  const [pts, setPts] = useState([]);
  const video = useRef();

  const area = (r) => (net ? r.area_m2 : r.gross_m2);
  const fmt = (m2) => (unit === "m2" ? `${m2.toFixed(2)} m²` : `${(m2 * SQFT).toFixed(1)} ft²`);
  const sumBy = (t) => rows.filter((r) => r.type === t).reduce((s, r) => s + area(r), 0);
  const total = rows.reduce((s, r) => s + area(r), 0);
  const paint = ((sumBy("Wall") + sumBy("Ceiling")) * 2) / 10; // 2 coats, ~10 m² per litre
  const flooring = sumBy("Floor") * 1.1; // +10% wastage
  const last = rows[0];

  const pick = (f) => { setFile(f); setSrc(URL.createObjectURL(f)); setOverlay(null); setErr(""); };
  const startCam = async () => {
    setCam(true);
    try { video.current.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
    catch { setCam(false); setErr("Camera access is blocked. Allow camera permission in your browser, or upload a photo instead."); }
  };
  const snap = () => {
    const v = video.current, c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    v.srcObject.getTracks().forEach((t) => t.stop());
    setCam(false);
    c.toBlob((b) => pick(new File([b], "camera.jpg", { type: "image/jpeg" })), "image/jpeg", 0.92);
  };
  const measure = async (e) => {
    if (!file || busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fd = new FormData();
    fd.append("image", file);
    fd.append("x", (e.clientX - r.left) / r.width);
    fd.append("y", (e.clientY - r.top) / r.height);
    fd.append("tol", tol);
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/measure", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Measurement failed.");
      const { overlay: o, ...rest } = d;
      setOverlay(o);
      setRows((p) => [{ id: p.length + 1, type: "Wall", ...rest }, ...p]);
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const outline = async () => {
    const fd = new FormData();
    fd.append("image", file); fd.append("points", JSON.stringify(pts));
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/measure_polygon", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Measurement failed.");
      const { overlay: o, ...rest } = d;
      setOverlay(o); setPts([]);
      setRows((p) => [{ id: p.length + 1, type: "Wall", ...rest }, ...p]);
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const onImg = (e) => {
    if (mode === "auto") return measure(e);
    if (!file || busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPts((p) => [...p, [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]]);
  };
  const setType = (id, type) => setRows((p) => p.map((r) => (r.id === id ? { ...r, type } : r)));
  const exportCsv = () => {
    const t = "id,type,net_area_m2,gross_area_m2,openings_m2,width_m,height_m,perimeter_m\n" +
      rows.map((r) => [r.id, r.type, r.area_m2, r.gross_m2, r.openings_m2, r.width_m, r.height_m, r.perimeter_m].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" }));
    a.download = "spatialvision-measurements.csv"; a.click();
  };

  const card = "card rounded-2xl border border-blue-900 bg-blue-950/40 p-5 shadow-[0_0_24px_rgba(59,130,246,0.08)]";
  const btn = "rounded-lg border border-blue-700 px-3 py-1.5 text-sm hover:border-pink-500 hover:text-pink-400";
  const on = "border-pink-500 text-pink-400";
  const note = "mt-2 text-xs leading-relaxed text-zinc-400";

  return (
    <div>
      <nav className="no-print sticky top-0 z-20 border-b border-blue-900/60 bg-[#04050d]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="#top" className="text-lg font-semibold">SpatialVision <span className="text-pink-500">AI</span></a>
          <div className="flex gap-5 text-sm text-zinc-300">
            <a href="#how" className="hover:text-pink-400">How it works</a>
            <a href="#measure" className="hover:text-pink-400">Measure</a>
            <a href="#uses" className="hover:text-pink-400">Use cases</a>
            <a href="#faq" className="hover:text-pink-400">Accuracy</a>
          </div>
        </div>
      </nav>

      <header id="top" className="no-print mx-auto grid max-w-6xl items-center gap-8 px-5 py-14 md:grid-cols-2 md:py-20">
        <div>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Measure any surface from <span className="text-pink-500">a single photo.</span></h1>
          <p className="mt-4 max-w-md text-zinc-300">SpatialVision AI turns a photo of a wall, floor or ceiling into accurate area, dimensions and material estimates. No tape measure required.</p>
          <a href="#measure" className="mt-7 inline-block rounded-lg bg-pink-500 px-6 py-3 font-semibold text-white hover:bg-pink-400">Start measuring</a>
        </div>
        <Room />
      </header>

      <section id="how" className="no-print mx-auto max-w-6xl px-5 py-12">
        <h2 className="mb-8 text-2xl font-semibold">How it works</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map(([t, d, art], i) => (
            <div key={t} className={card}>{art}
              <h3 className="mt-4 font-medium"><span className="text-pink-500">{i + 1}.</span> {t}</h3>
              <p className={note}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="measure" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-12">
        <div className="print-only mb-4"><h1 className="text-2xl font-bold">SpatialVision AI: Measurement Report</h1><p>{new Date().toLocaleDateString()}</p></div>
        <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-semibold">Measurement workspace</h2>
            <p className="mt-1 text-sm text-zinc-400">Upload a photo with an A4 sheet on the surface, then click the surface to measure it.</p></div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            Units
            {["m2", "sqft"].map((u) => <button key={u} onClick={() => setUnit(u)} className={`${btn} ${unit === u ? on : ""}`}>{u === "m2" ? "m²" : "ft²"}</button>)}
            <button onClick={() => setNet(!net)} className={`${btn} ${net ? on : ""}`}>{net ? "Net area (openings deducted)" : "Gross area"}</button>
          </div>
        </div>

        <div className="no-print grid gap-5 lg:grid-cols-3">
          <div className={`${card} lg:col-span-2`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className={`${btn} cursor-pointer`}>Upload photo
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && pick(e.target.files[0])} /></label>
              <button onClick={cam ? snap : startCam} className={btn}>{cam ? "Capture" : "Use camera"}</button>
              <button onClick={() => { setMode("auto"); setPts([]); }} className={`${btn} ${mode === "auto" ? on : ""}`}>Auto select</button>
              <button onClick={() => setMode("manual")} className={`${btn} ${mode === "manual" ? on : ""}`}>Manual outline</button>
              <label className="ml-auto flex items-center gap-2 text-xs text-zinc-300">Selection sensitivity
                <input type="range" min="3" max="30" value={tol} onChange={(e) => setTol(+e.target.value)} /></label>
            </div>
            <video ref={video} autoPlay playsInline muted className={`w-full rounded-lg ${cam ? "" : "hidden"}`} />
            {!cam && !src && (
              <div className="grid h-72 place-items-center rounded-lg border border-dashed border-blue-700 px-4 text-center text-sm text-zinc-400">
                <p>Upload a photo of a wall, floor or table.<br />A full A4 sheet must be visible on the surface.</p></div>)}
            {!cam && src && (
              <div className="relative grid place-items-center overflow-hidden rounded-lg bg-black">
                <div className="relative inline-block">
                  <img src={overlay || src} onClick={onImg} alt="Selected surface" className="block max-h-[65vh] w-auto cursor-crosshair" />
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                    <polyline points={pts.map((q) => q.join(",")).join(" ")} fill="rgba(255,46,154,0.25)" stroke="#ff2e9a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {pts.map((q, i) => <span key={i} className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 ring-2 ring-white" style={{ left: `${q[0] * 100}%`, top: `${q[1] * 100}%` }} />)}
                </div>
                {busy && <div className="absolute inset-0 grid place-items-center bg-black/60 text-pink-400">Analysing surface…</div>}
              </div>)}
            {mode === "manual" && src && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                <span>Click the corners of the surface, then calculate. ({pts.length} points)</span>
                <button onClick={outline} disabled={pts.length < 3 || busy} className={`${btn} disabled:opacity-40`}>Calculate area</button>
                <button onClick={() => setPts((p) => p.slice(0, -1))} disabled={!pts.length} className={`${btn} disabled:opacity-40`}>Undo</button>
                <button onClick={() => setPts([])} disabled={!pts.length} className={`${btn} disabled:opacity-40`}>Clear</button>
              </div>)}
            {err && <p className="mt-3 rounded-lg border border-pink-700 bg-pink-950/40 p-3 text-sm text-pink-300">{err}</p>}
            <p className={note}><b className="text-zinc-300">Selection sensitivity</b> controls how similar in colour the surrounding pixels must be to count as part of the surface. Lower values select a tighter region; higher values select a wider one. Adjust it and click again if the highlight is too small or too large.</p>
          </div>

          <aside className="space-y-5">
            <div className={card}>
              <p className="text-sm text-zinc-400">Last measurement</p>
              <p className="mt-1 text-4xl font-semibold text-pink-400">{last ? fmt(area(last)) : "—"}</p>
              {last && <div className="mt-2 text-sm text-zinc-300">
                <p>Bounding box: {last.width_m} m × {last.height_m} m · perimeter {last.perimeter_m} m{last.openings_m2 > 0 && ` · openings ${last.openings_m2} m²`}</p>
                <p className="mt-1 text-xs text-zinc-400">The selected shape fills {Math.round((last.gross_m2 / (last.width_m * last.height_m)) * 100)}% of its bounding box, so the area is smaller than width × height.</p>
              </div>}
            </div>
            <div className={card}>
              <p className="text-sm text-zinc-400">Project total ({rows.length} {rows.length === 1 ? "surface" : "surfaces"})</p>
              <p className="mt-1 text-2xl font-semibold text-blue-400">{rows.length ? fmt(total) : "—"}</p>
              <p className={note}>Sum of every surface measured in this project.</p>
            </div>
            <div className={card}>
              <p className="text-sm text-zinc-400">Measurement accuracy</p>
              <p className="mt-1 text-xl font-semibold">Under validation</p>
              <p className={note}>Results are most reliable when the A4 sheet lies flat on the surface and the photo is taken roughly straight on. Accuracy is being validated against tape-measured surfaces.</p>
            </div>
          </aside>
        </div>

        <div className={`${card} mt-5`}>
          <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Project summary</h3>
            <div className="flex gap-2">
              <button onClick={exportCsv} disabled={!rows.length} className={`${btn} disabled:opacity-40`}>Export CSV</button>
              <button onClick={() => window.print()} disabled={!rows.length} className={`${btn} disabled:opacity-40`}>Download PDF report</button>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TYPES.map((t) => <div key={t} className="rounded-lg border border-blue-900 p-3"><p className="text-xs text-zinc-400">{t}</p><p className="font-semibold">{fmt(sumBy(t))}</p></div>)}
          </div>
          {rows.length > 0 && (
            <p className="mb-4 text-sm text-zinc-300">Estimated paint: <b>{paint.toFixed(1)} L</b> (2 coats, ~10 m² per litre) · Flooring to order: <b>{fmt(flooring)}</b> (includes 10% wastage)</p>)}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500"><tr><th className="py-1">#</th><th>Type</th><th>Area</th><th>Bounding box</th><th>Perimeter</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-blue-900">
                    <td className="py-2">{r.id}</td>
                    <td><select value={r.type} onChange={(e) => setType(r.id, e.target.value)} className="rounded border border-blue-800 bg-transparent px-1 py-0.5">
                      {TYPES.map((t) => <option key={t} className="bg-[#04050d]">{t}</option>)}</select></td>
                    <td>{fmt(area(r))}</td><td>{r.width_m} × {r.height_m} m</td><td>{r.perimeter_m} m</td>
                  </tr>))}
                {!rows.length && <tr><td colSpan="5" className="py-4 text-zinc-500">No measurements yet. Upload a photo and click a surface to begin.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="uses" className="no-print mx-auto max-w-6xl scroll-mt-16 px-5 py-12">
        <h2 className="mb-8 text-2xl font-semibold">Use cases</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {uses.map(([t, d]) => <div key={t} className={card}><h3 className="font-medium text-pink-400">{t}</h3><p className={note}>{d}</p></div>)}
        </div>
      </section>

      <section id="faq" className="no-print mx-auto max-w-6xl scroll-mt-16 px-5 py-12">
        <h2 className="mb-8 text-2xl font-semibold">Accuracy and limitations</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {faq.map(([q, a]) => <div key={q} className={card}><h3 className="font-medium">{q}</h3><p className={note}>{a}</p></div>)}
        </div>
      </section>

      <footer className="no-print border-t border-blue-900/60 py-8 text-center text-sm text-zinc-500">© 2026 SpatialVision AI. Computer vision based area measurement.</footer>
    </div>
  );
}
