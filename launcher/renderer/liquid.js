/* ——— Verre liquide, dessiné par la carte graphique (WebGL) ———
   Une source : soit l'écran derrière la fenêtre en direct (capture dont la fenêtre elle-même est exclue, donc on
   voit les fenêtres et le bureau derrière, comme sur iPhone), soit le fond d'écran, soit une scène rose.
   Un seul shader dessine toute la fenêtre à chaque image :
   - la dalle (toute la fenêtre) : le fond se courbe le long des bords, comme à travers une plaque épaisse ;
   - chaque panneau .glass : une goutte plus fine, avec du givre (flou), une teinte rose pâle, un liseré lumineux
     éclairé d'en haut à gauche et un bord irisé (rouge, vert et bleu réfractés un peu différemment).
   La position de la fenêtre est relue à chaque image (window.screenX/Y), sans attendre de message : le fond reste
   collé à l'écran pendant qu'on déplace la fenêtre. */
const Liquid = (() => {
  const MAX = 12;
  let gl, prog, tex, buf, U = {}, raf = 0, src = null, kind = "", fit = "cover", disp = { dx: 0, dy: 0, dw: 1, dh: 1 };
  let canvas = null, lastKey = "", stream = null;
  const radii = new WeakMap(); // arrondi de chaque panneau : relu une seule fois (getComputedStyle à chaque image coûte)

  const VS = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
  const FS = `precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uDpr;
uniform vec2 uWin; uniform vec2 uScale; uniform vec2 uOff; uniform float uWinRad;
uniform vec4 uRect[${MAX}]; uniform float uRad[${MAX}]; uniform int uCount;
float sdr(vec2 p, vec4 r, float rad){ vec2 c = r.xy + r.zw * 0.5; vec2 q = abs(p - c) - r.zw * 0.5 + rad; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad; }
vec3 tx(vec2 p){ return texture2D(uTex, clamp((uWin + p) * uScale + uOff, 0.0, 1.0)).rgb; }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 size = uRes / uDpr;
  vec4 win = vec4(0.0, 0.0, size);
  float dw = sdr(p, win, uWinRad);
  if (dw > 0.5) { gl_FragColor = vec4(0.0); return; }
  // Dans quel panneau est ce pixel (sinon : la dalle de la fenêtre)
  vec4 r = win; float rad = uWinRad; float d = dw; bool panel = false;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    float di = sdr(p, uRect[i], uRad[i]);
    if (di < 0.0) { r = uRect[i]; rad = uRad[i]; d = di; panel = true; }
  }
  float band = panel ? 20.0 : 44.0;
  float str = panel ? 26.0 : 40.0;
  // Normale du bord (dérivée de la distance)
  vec2 e = vec2(1.0, 0.0);
  vec2 n = normalize(vec2(sdr(p + e.xy, r, rad) - sdr(p - e.xy, r, rad), sdr(p + e.yx, r, rad) - sdr(p - e.yx, r, rad)) + 1e-5);
  float t = clamp(1.0 + d / band, 0.0, 1.0);
  float bend = t * t * t;
  vec2 off = -n * str * bend;
  vec3 col;
  if (panel) {
    // Givre : 12 échantillons en disque autour du point réfracté
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 2.39996;
      float rr = 7.0 * sqrt((float(k) + 0.5) / 12.0);
      acc += tx(p + off + vec2(cos(a), sin(a)) * rr);
    }
    col = acc / 12.0;
  } else {
    col = tx(p + off * 1.0);
  }
  // Bord irisé : rouge, vert et bleu ne se courbent pas tout à fait pareil
  vec3 chroma = vec3(tx(p + off * 1.08).r, tx(p + off).g, tx(p + off * 0.92).b);
  col = mix(col, chroma, bend * (panel ? 0.55 : 0.85));
  // Couleurs ravivées, un peu de lumière
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.35) * 1.04;
  // Teinte : rose pâle sur les panneaux (lisibilité), presque rien sur la dalle
  // Sur un fond sombre, la teinte monte (comme le « vibrancy » d'iOS) : le texte prune reste lisible
  float tintK = panel ? mix(0.62, 0.36, smoothstep(0.25, 0.75, l)) : 0.07;
  col = mix(col, vec3(1.0, 0.95, 0.975), tintK);
  // Liseré lumineux, éclairé d'en haut à gauche, et lueur intérieure le long du bord
  float rim = 1.0 - smoothstep(0.0, panel ? 1.6 : 2.0, -d);
  float light = 0.5 + 0.5 * dot(n, normalize(vec2(-0.6, -0.8)));
  col += rim * (0.25 + 0.75 * light) * 0.85;
  col += (1.0 - smoothstep(0.0, band * 0.8, -d)) * 0.05 * (0.4 + light);
  // Reflet doux en haut des panneaux
  if (panel) col += 0.07 * (1.0 - smoothstep(0.0, r.w * 0.45, p.y - r.y)) * (1.0 - smoothstep(0.0, r.z, p.x - r.x) * 0.6);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(0.5 - dw, 0.0, 1.0));
}`;

  function init() {
    if (gl) return true;
    canvas = document.createElement("canvas");
    canvas.className = "liquid";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true, antialias: false, powerPreference: "high-performance" });
    if (!gl) { canvas.remove(); canvas = null; return false; }
    const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uTex", "uRes", "uDpr", "uWin", "uScale", "uOff", "uWinRad", "uRect", "uRad", "uCount"]) U[n] = gl.getUniformLocation(prog, n);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); });
    return true;
  }

  function size() {
    const d = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    return d;
  }

  // Les panneaux de verre visibles, en pixels de la fenêtre
  function rects() {
    const out = [];
    for (const el of document.querySelectorAll(".glass")) {
      if (out.length >= MAX || !el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4 || el.closest("[hidden]") || (el.closest(".shell") && document.body.classList.contains("gated"))) continue;
      if (!radii.has(el)) radii.set(el, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16);
      out.push([b.left, b.top, b.width, b.height, radii.get(el)]);
    }
    return out;
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!src) return;
    const ready = kind === "video" ? src.readyState >= 2 : src.complete !== false;
    if (!ready) return;
    const dpr = size();
    const vw = kind === "video" ? src.videoWidth : src.width || src.naturalWidth, vh = kind === "video" ? src.videoHeight : src.height || src.naturalHeight;
    if (!vw || !vh) return;
    const list = rects();
    const key = kind === "video" ? "" : [screenX, screenY, innerWidth, innerHeight, disp.dx, disp.dy, JSON.stringify(list)].join("|");
    if (kind !== "video" && key === lastKey) return; // image fixe et rien n'a bougé : pas besoin de redessiner
    lastKey = key;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (kind === "video" || src._dirty !== false) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); src._dirty = false; }
    // Où est l'image sur l'écran : la capture couvre l'écran ; le fond d'écran suit son placement ; la scène suit la fenêtre
    let wx, wy, sx, sy, ox = 0, oy = 0;
    if (kind === "scene") { wx = 0; wy = 0; sx = 1 / innerWidth; sy = 1 / innerHeight; }
    else {
      wx = screenX - disp.dx; wy = screenY - disp.dy;
      if (kind === "video" || fit === "stretch") { sx = 1 / disp.dw; sy = 1 / disp.dh; }
      else {
        const s = fit === "contain" ? Math.min(disp.dw / vw, disp.dh / vh) : fit === "center" ? 1 : Math.max(disp.dw / vw, disp.dh / vh);
        const w = vw * s, h = vh * s;
        sx = 1 / w; sy = 1 / h; ox = -((disp.dw - w) / 2) / w; oy = -((disp.dh - h) / 2) / h;
      }
    }
    gl.uniform1i(U.uTex, 0);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform2f(U.uWin, wx, wy);
    gl.uniform2f(U.uScale, sx, sy);
    gl.uniform2f(U.uOff, ox, oy);
    gl.uniform1f(U.uWinRad, document.body.classList.contains("maxed") ? 0 : 16);
    const rf = new Float32Array(MAX * 4), rr = new Float32Array(MAX);
    list.forEach((r, i) => { rf.set(r.slice(0, 4), i * 4); rr[i] = r[4]; });
    gl.uniform4fv(U.uRect, rf);
    gl.uniform1fv(U.uRad, rr);
    gl.uniform1i(U.uCount, list.length);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function run(source, k) {
    src = source; kind = k; lastKey = "";
    document.body.classList.add("liquid-on");
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0; src = null;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    document.body.classList.remove("liquid-on");
    if (gl) gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // L'écran derrière, en direct (la fenêtre du launcher est exclue de la capture par le système)
  async function live() {
    if (!init()) return false;
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 }, cursor: "never" }, audio: false });
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.srcObject = stream;
      await v.play();
      run(v, "video");
      return true;
    } catch (e) { console.warn("Capture impossible :", e); stop(); return false; }
  }

  async function image(url, how) {
    if (!init()) return false;
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { return false; }
    fit = how || "cover";
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    run(img, "image");
    return true;
  }

  // Scène rose 1999 : des lueurs douces, dessinées une fois dans une image
  function scene() {
    if (!init()) return false;
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1000;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 1600, 1000);
    g.addColorStop(0, "#fff0f7"); g.addColorStop(1, "#fbdcec");
    x.fillStyle = g; x.fillRect(0, 0, 1600, 1000);
    for (const [cx, cy, r, col] of [[240, 140, 700, "#ffb3d6"], [1400, 220, 620, "#e3ccff"], [900, 980, 760, "#ffc2dc"], [1250, 760, 420, "#ffd7ec"], [520, 700, 380, "#f9a8cf"]]) {
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, col); rg.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 1600, 1000);
    }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    run(c, "scene");
    return true;
  }

  // Fenêtre réduite ou cachée : plus de capture du tout. Fenêtre ouverte sans le focus : moins d'images par seconde.
  function pause() { cancelAnimationFrame(raf); raf = 0; if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
  function rate(fps) { if (stream) stream.getVideoTracks().forEach((t) => t.applyConstraints({ frameRate: { ideal: fps, max: fps } }).catch(() => {})); }

  return { live, image, scene, stop, pause, rate, setDisplay: (b) => { if (b) { disp = b; lastKey = ""; } }, isOn: () => !!src };
})();
