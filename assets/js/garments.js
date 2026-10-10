/* Flat garment illustrations. They stand in for product photography until real
   photos are added to a product's "photos" list in products.json. */
(function () {
  const BRAND = "fló";
  let uid = 0;

  const SHAPES = {
    tee: {
      body: "M150 52 C170 66 230 66 250 52 L318 78 L376 160 L328 190 L306 166 L306 440 C240 446 160 446 94 440 L94 166 L72 190 L24 160 L82 78 Z",
      collarFront: "M150 52 C170 66 230 66 250 52 C246 78 228 92 200 92 C172 92 154 78 150 52 Z",
      collarBack: "M150 52 C170 62 230 62 250 52 C240 64 222 70 200 70 C178 70 160 64 150 52 Z",
      seams: ["M306 166 C300 130 306 100 318 78", "M94 166 C100 130 94 100 82 78"],
      stitches: ["M98 428 C160 434 240 434 302 428", "M334 180 L368 158", "M66 180 L32 158"],
      chest: [252, 150], center: [200, 190], back: [200, 220]
    },
    longsleeve: {
      body: "M150 52 C170 66 230 66 250 52 L318 78 C340 120 352 250 360 420 L326 426 L306 196 L306 440 C240 446 160 446 94 440 L94 196 L74 426 L40 420 C48 250 60 120 82 78 Z",
      collarFront: "M150 52 C170 66 230 66 250 52 C246 78 228 92 200 92 C172 92 154 78 150 52 Z",
      collarBack: "M150 52 C170 62 230 62 250 52 C240 64 222 70 200 70 C178 70 160 64 150 52 Z",
      seams: ["M306 196 C300 140 306 100 318 78", "M94 196 C100 140 94 100 82 78"],
      stitches: ["M98 428 C160 434 240 434 302 428", "M328 400 L359 396", "M72 400 L41 396"],
      chest: [252, 150], center: [200, 190], back: [200, 220]
    },
    crew: {
      body: "M146 54 C170 68 230 68 254 54 L322 82 C344 124 356 252 362 424 L326 430 L308 204 L308 444 C240 450 160 450 92 444 L92 204 L74 430 L38 424 C44 252 56 124 78 82 Z",
      collarFront: "M146 54 C170 68 230 68 254 54 C250 84 230 100 200 100 C170 100 150 84 146 54 Z",
      collarBack: "M146 54 C170 64 230 64 254 54 C244 70 224 76 200 76 C176 76 156 70 146 54 Z",
      seams: ["M308 204 C300 150 308 104 322 82", "M92 204 C100 150 92 104 78 82"],
      stitches: ["M94 414 C160 420 240 420 306 414", "M326 394 L360 390", "M74 394 L40 390"],
      ribs: true,
      chest: [252, 156], center: [200, 210], back: [200, 220]
    },
    hoodie: {
      body: "M140 70 C170 82 230 82 260 70 L322 92 C344 134 356 260 364 424 L328 430 L308 210 L308 444 C240 450 160 450 92 444 L92 210 L72 430 L36 424 C44 260 56 134 78 92 Z",
      hoodFront: "M140 72 C136 30 168 8 200 8 C232 8 264 30 260 72 C250 104 228 118 200 118 C172 118 150 104 140 72 Z",
      hoodInner: "M158 70 C160 40 180 26 200 26 C220 26 240 40 242 70 C234 92 220 102 200 102 C180 102 166 92 158 70 Z",
      hoodBack: "M140 74 C136 24 168 2 200 2 C232 2 264 24 260 74 C238 88 162 88 140 74 Z",
      seams: ["M308 210 C300 150 308 110 322 92", "M92 210 C100 150 92 110 78 92"],
      stitches: ["M94 414 C160 420 240 420 306 414", "M330 398 L363 394", "M70 398 L37 394"],
      pocket: "M126 318 L274 318 L296 404 L104 404 Z",
      strings: ["M186 106 L183 178", "M214 106 L217 178"],
      ribs: true,
      chest: [252, 168], center: [200, 230], back: [200, 230]
    },
    pant: {
      body: "M108 62 L292 62 L306 250 L298 446 L222 446 L204 172 L196 172 L178 446 L102 446 L94 250 Z",
      band: "M110 28 L290 28 L292 64 L108 64 Z",
      seams: ["M120 72 C134 108 136 124 130 154", "M280 72 C266 108 264 124 270 154", "M200 64 L200 172"],
      stitches: ["M104 420 L178 420", "M222 420 L298 420"],
      strings: ["M192 46 L186 104", "M208 46 L214 104"],
      thigh: [150, 150]
    },
    short: {
      body: "M108 62 L292 62 L314 292 L214 302 L202 196 L198 196 L186 302 L86 292 Z",
      band: "M110 28 L290 28 L292 64 L108 64 Z",
      seams: ["M120 72 C134 108 136 124 130 154", "M280 72 C266 108 264 124 270 154", "M200 64 L200 196"],
      stitches: ["M90 278 L186 288", "M214 288 L310 278"],
      strings: ["M192 46 L186 104", "M208 46 L214 104"],
      thigh: [148, 150]
    },
    cap: {
      body: "M86 300 C86 170 140 112 200 112 C260 112 314 170 314 300 Z",
      brim: "M86 300 C140 286 260 286 314 300 C330 334 296 356 200 356 C104 356 70 334 86 300 Z",
      seams: ["M200 112 C186 170 182 240 184 300", "M200 112 C214 170 218 240 216 300"],
      stitches: ["M100 322 C150 334 250 334 300 322"],
      button: [200, 112],
      center: [200, 236]
    },
    tote: {
      body: "M70 150 L330 150 L342 456 L58 456 Z",
      handles: "M140 152 C140 30 260 30 260 152",
      stitches: ["M74 168 L326 168"],
      center: [200, 300]
    }
  };

  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v =>
      Math.max(0, Math.min(255, Math.round(v + amt))));
    return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
  }

  const PRINT_RATIOS = { "grand-touring": 0.9, "crest-car": 1, "classic-wordmark": 0.3 };

  function printMarkup(kind, s, ink, id, back) {
    const serif = "font-family:'Bodoni Moda',Didot,serif";
    const sans = "font-family:Jost,Futura,sans-serif";
    if (kind === "chest" && s.chest) {
      return `<text x="${s.chest[0]}" y="${s.chest[1]}" text-anchor="middle" fill="${ink}" style="${serif};font-size:22px;font-weight:500">${BRAND}</text>`;
    }
    if (kind === "thigh" && s.thigh) {
      return `<text x="${s.thigh[0]}" y="${s.thigh[1]}" text-anchor="middle" fill="${ink}" style="${serif};font-size:20px;font-weight:500">${BRAND}</text>`;
    }
    if (kind === "center" && s.center) {
      const [x, y] = s.center;
      const big = s === SHAPES.cap ? 40 : 58;
      return `<text x="${x}" y="${y}" text-anchor="middle" fill="${ink}" style="${serif};font-size:${big}px;font-weight:500;font-style:italic">${BRAND}</text>` +
        (s === SHAPES.cap ? "" : `<text x="${x}" y="${y + 24}" text-anchor="middle" fill="${ink}" style="${sans};font-size:9px;letter-spacing:4px;font-weight:500">MAISON DE CONFORT</text>`);
    }
    if (kind === "back-big" && s.back) {
      const [x, y] = s.back;
      return `<text x="${x}" y="${y}" text-anchor="middle" fill="${ink}" style="${serif};font-size:120px;font-weight:400;font-style:italic">${BRAND}</text>` +
        `<text x="${x}" y="${y + 40}" text-anchor="middle" fill="${ink}" style="${sans};font-size:10px;letter-spacing:5px;font-weight:500">MAISON DE CONFORT</text>` +
        `<text x="${x}" y="${y + 58}" text-anchor="middle" fill="${ink}" style="${sans};font-size:9px;letter-spacing:4px;opacity:.7">EST. MMXXVI</text>`;
    }
    if (kind === "back-type" && s.back) {
      const [x, y] = s.back;
      const lines = ["SOFT", "BY", "DESIGN"];
      return lines.map((t, i) =>
        `<text x="${x}" y="${y - 30 + i * 40}" text-anchor="middle" fill="${ink}" style="${sans};font-size:38px;font-weight:700;font-style:italic;letter-spacing:1px">${t}</text>`
      ).join("") + `<text x="${x}" y="${y + 70}" text-anchor="middle" fill="${ink}" style="${serif};font-size:20px;font-style:italic">${BRAND}</text>`;
    }
    if (kind && kind.startsWith("img:")) {
      // artwork files in black, cream and white ink: assets/img/prints/<name>-<ink>.png
      const name = kind.slice(4);
      const inkName = ink === "#ffffff" ? "white" : ink === "#efe8dc" ? "cream" : "black";
      const file = `assets/img/prints/${name}-${inkName}.png`;
      const ratio = PRINT_RATIOS[name] || 1;
      const anchor = back ? s.back : s.center;
      if (!anchor) return "";
      const w = back ? 200 : 150, h = w * ratio;
      return `<image href="${file}" x="${anchor[0] - w / 2}" y="${anchor[1] - h / 2 + (back ? 4 : 0)}" width="${w}" height="${h}"/>`;
    }
    if (kind === "classic") {
      // the FLÓ wordmark in Marcellus: upper back on tops, thigh on bottoms, front of the cap
      const classic = "font-family:Marcellus,'Bodoni Moda',serif";
      const spot = back && s.back ? [s.back[0], s.back[1] - 66, 62, 7]
        : s.thigh ? [s.thigh[0], s.thigh[1], 24, 3]
        : s.center ? [s.center[0], s.center[1], 46, 5] : null;
      if (!spot) return "";
      return `<text x="${spot[0]}" y="${spot[1]}" text-anchor="middle" fill="${ink}" style="${classic};font-size:${spot[2]}px;letter-spacing:${spot[3]}px">FLÓ</text>`;
    }
    if (kind === "monogram") {
      // all-over pattern, clipped to the bag body
      let cells = "";
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const x = 70 + col * 46 + (row % 2 ? 23 : 0);
          const y = 190 + row * 34;
          cells += (row + col) % 2
            ? `<text x="${x}" y="${y}" text-anchor="middle" fill="${ink}" style="${serif};font-size:17px;font-style:italic">${BRAND}</text>`
            : `<path d="M${x} ${y - 13} l5 7 l-5 7 l-5 -7 Z" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
        }
      }
      return `<g clip-path="url(#clip${id})" opacity=".8">${cells}</g>`;
    }
    return "";
  }

  function garmentSVG(type, hex, kind, opts = {}) {
    const s = SHAPES[type] || SHAPES.tee;
    const id = ++uid;
    const dark = isDark(hex);
    const ink = dark ? "#efe8dc" : "#1d1b18";
    const edge = shade(hex, dark ? 26 : -34);
    const stitch = shade(hex, dark ? 40 : -48);
    const back = opts.side === "back";
    const parts = [];

    parts.push(`<defs>
      <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .07 : .22}"/>
        <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="${dark ? .28 : .14}"/>
      </linearGradient>
      <path id="b${id}" d="${s.body}"/>
      <clipPath id="clip${id}"><use href="#b${id}"/></clipPath>
    </defs>`);

    if (s.handles) parts.push(`<path d="${s.handles}" fill="none" stroke="${edge}" stroke-width="14" stroke-linecap="round"/>`);
    if (s.hoodFront && back) parts.push(`<path d="${s.hoodBack}" fill="${hex}" stroke="${edge}" stroke-width="1.5"/>`);

    parts.push(`<use href="#b${id}" fill="${hex}" stroke="${edge}" stroke-width="1.5"/>`);
    if (s.band) parts.push(`<path d="${s.band}" fill="${shade(hex, dark ? 10 : -12)}" stroke="${edge}" stroke-width="1.5"/>`);
    if (s.brim) parts.push(`<path d="${s.brim}" fill="${shade(hex, dark ? 8 : -10)}" stroke="${edge}" stroke-width="1.5"/>`);

    (s.seams || []).forEach(d => parts.push(`<path d="${d}" fill="none" stroke="${edge}" stroke-width="1.2"/>`));
    (s.stitches || []).forEach(d => parts.push(`<path d="${d}" fill="none" stroke="${stitch}" stroke-width="1" stroke-dasharray="3 3"/>`));
    if (s.ribs) parts.push(`<path d="M92 418 L92 444 C160 450 240 450 308 444 L308 418" fill="${shade(hex, dark ? 6 : -8)}" stroke="${edge}" stroke-width="1.2"/>`);

    if (s.hoodFront && back) parts.push(`<path d="M200 4 L200 80" stroke="${edge}" stroke-width="1.2"/>`);
    if (s.hoodFront && !back) {
      parts.push(`<path d="${s.hoodFront}" fill="${hex}" stroke="${edge}" stroke-width="1.5"/>`);
      parts.push(`<path d="${s.hoodInner}" fill="${shade(hex, dark ? -14 : -40)}"/>`);
    }
    if (s.collarFront) parts.push(`<path d="${back ? s.collarBack : s.collarFront}" fill="${shade(hex, dark ? -10 : -22)}" stroke="${edge}" stroke-width="1.2"/>`);
    if (s.pocket && !back) parts.push(`<path d="${s.pocket}" fill="none" stroke="${edge}" stroke-width="1.3"/>`);
    if (s.strings && !back) s.strings.forEach(d => parts.push(`<path d="${d}" stroke="${shade(hex, dark ? 60 : -60)}" stroke-width="3" stroke-linecap="round"/>`));
    if (s.button) parts.push(`<circle cx="${s.button[0]}" cy="${s.button[1]}" r="8" fill="${edge}"/>`);
    if (type === "cap" && back) parts.push(`<path d="M164 300 C170 262 230 262 236 300 Z" fill="${shade(hex, dark ? -14 : -30)}"/>`);

    parts.push(printMarkup(back ? kind.back : kind.front, s, opts.ink === "white" ? "#ffffff" : ink, id, back));

    // light falloff over everything that sits on the garment body
    parts.push(`<use href="#b${id}" fill="url(#g${id})"/>`);

    const cls = opts.className ? ` class="${opts.className}"` : "";
    return `<svg${cls} viewBox="0 0 400 480" role="img" aria-label="${opts.label || ""}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  }

  window.garmentSVG = garmentSVG;
})();
