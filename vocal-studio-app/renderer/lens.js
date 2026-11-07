/* ——— Verre liquide des onglets ———
   Une vraie lentille : un filtre SVG à la taille exacte de l'élément, neutre au centre, qui courbe ce qu'il y a dessous
   le long du bord arrondi, avec un léger décalage rouge / vert / bleu (le liseré irisé).
   Lens.apply : un bouton posé sur le fond (ronds de l'accueil).
   Lens.pill : une pastille de verre qui glisse d'un onglet à l'autre, posée AU-DESSUS des libellés : le texte se courbe
   sur ses bords, comme la barre d'onglets d'iOS. La carte change de taille avec l'élément : elle est gardée par taille.
   En mode Économie : pas de filtre SVG, simple flou. */
const Lens = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const root = document.querySelector("svg");
  const made = new Set();
  const eco = () => document.body.classList.contains("eco");

  function edgeMap(w, h, band, r) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs>` +
      `<linearGradient id='r' x1='0' x2='1' y1='0' y2='0'><stop offset='0' stop-color='#ff0000'/><stop offset='1' stop-color='#000000'/></linearGradient>` +
      `<linearGradient id='g' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#00ff00'/><stop offset='1' stop-color='#000000'/></linearGradient>` +
      `<filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='${(band / 2.4).toFixed(1)}'/></filter></defs>` +
      `<rect width='${w}' height='${h}' fill='url(#r)'/><rect width='${w}' height='${h}' fill='url(#g)' style='mix-blend-mode:screen'/>` +
      `<rect x='${band}' y='${band}' width='${Math.max(1, w - 2 * band)}' height='${Math.max(1, h - 2 * band)}' rx='${Math.max(0, r - band)}' fill='#808080' filter='url(#b)'/></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function filter(w, h, band, r, scale) {
    const id = `lens-${w}-${h}-${band}-${r}-${scale}`;
    if (made.has(id)) return id;
    made.add(id);
    const f = document.createElementNS(NS, "filter");
    f.id = id;
    f.setAttribute("color-interpolation-filters", "sRGB");
    f.setAttribute("filterUnits", "userSpaceOnUse");
    for (const [k, v] of [["x", 0], ["y", 0], ["width", w], ["height", h]]) f.setAttribute(k, v);
    const disp = [1, 0.93, 0.86].map((k, i) => `<feDisplacementMap in="SourceGraphic" in2="map" scale="${(scale * k).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d${i}"/>`).join("");
    f.innerHTML = `<feImage result="map" preserveAspectRatio="none" x="0" y="0" width="${w}" height="${h}" href="${edgeMap(w, h, band, r)}"/>${disp}` +
      `<feColorMatrix in="d0" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="c0"/>` +
      `<feColorMatrix in="d1" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="c1"/>` +
      `<feColorMatrix in="d2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="c2"/>` +
      `<feBlend in="c0" in2="c1" mode="screen" result="rg"/><feBlend in="rg" in2="c2" mode="screen"/>`;
    root.appendChild(f);
    return id;
  }

  function set(el, value) { el.style.backdropFilter = value; el.style.webkitBackdropFilter = value; }
  function lens(el, band, scale, extra) {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (!w || !h) return;
    if (eco()) return set(el, "blur(8px) saturate(1.5)");
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, Math.min(w, h) / 2);
    set(el, `url(#${filter(w, h, Math.round(Math.min(band, Math.min(w, h) / 3)), Math.round(r), scale)}) ${extra}`);
  }

  // Pendant que la taille change, simple flou (recalculer la carte à chaque image saccaderait) ; la lentille revient à l'arrivée
  function apply(el, band = 12, scale = 22, extra = "blur(1.5px) saturate(1.7) brightness(1.06)") {
    let t = 0;
    const settle = () => lens(el, band, scale, extra);
    new ResizeObserver(() => { set(el, "blur(3px) saturate(1.6)"); clearTimeout(t); t = setTimeout(settle, 140); }).observe(el);
    settle();
  }

  function pill(nav, attr) {
    const glass = document.createElement("i");
    glass.className = "tab-glass";
    glass.setAttribute("aria-hidden", "true");
    nav.appendChild(glass);
    let t = 0;
    const place = (animate) => {
      const b = nav.querySelector(`button[${attr}="true"]`);
      if (!b || !b.offsetWidth) return;
      if (b.offsetLeft < nav.scrollLeft) nav.scrollLeft = b.offsetLeft;
      else if (b.offsetLeft + b.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = b.offsetLeft + b.offsetWidth - nav.clientWidth;
      const changed = glass.dataset.key !== b.textContent;
      glass.dataset.key = b.textContent;
      glass.style.width = b.offsetWidth + "px";
      glass.style.height = b.offsetHeight + "px";
      glass.style.translate = `${b.offsetLeft}px ${b.offsetTop}px`;
      if (changed && animate) { glass.classList.add("moving"); clearTimeout(t); t = setTimeout(() => { glass.classList.remove("moving"); lens(glass, 4, 6, "saturate(1.3) brightness(1.03)"); }, 360); }
      else lens(glass, 4, 6, "saturate(1.3) brightness(1.03)");
    };
    new MutationObserver(() => place(true)).observe(nav, { subtree: true, attributes: true, attributeFilter: [attr] });
    new ResizeObserver(() => place(false)).observe(nav);
    place(false);
  }

  return { apply, pill };
})();
