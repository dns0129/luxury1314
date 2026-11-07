// 1314 Luxury — 首頁「液態絲綢」背景
// WebGL 片段著色器：以 domain-warp 噪聲模擬緩慢流動的粉色絲綢。
// - 滑鼠／手指會輕輕擾動流體
// - AI 回覆時 energy 升高：流速加快、光澤增強（window.fluid.setEnergy）
// - 不在畫面內或分頁隱藏時自動暫停，省電
(() => {
  const canvas = document.getElementById("fluid");
  if (!canvas) return;

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) {
    canvas.classList.add("is-fallback"); // CSS 會改用靜態漸層
    window.fluid = { setEnergy() {} };
    return;
  }

  const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const FRAG = `
    precision mediump float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uEnergy;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 5; i++){ v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
      return v;
    }

    void main(){
      float s = min(uRes.x, uRes.y);
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / s;
      vec2 m = (uMouse - 0.5) * uRes / s;
      float t = uTime * (0.045 + 0.09 * uEnergy);

      // 指標附近的漩渦
      float md = length(p - m);
      vec2 swirl = vec2(-(p.y - m.y), p.x - m.x) * exp(-md * 2.6) * 0.35;

      vec2 q = vec2(fbm(p * 1.3 + t), fbm(p * 1.3 + vec2(5.2, 1.3) - t * 0.8));
      vec2 w = vec2(fbm(p * 1.5 + 3.2 * q + swirl + vec2(1.7, 9.2) + t * 1.2),
                    fbm(p * 1.5 + 3.2 * q - swirl + vec2(8.3, 2.8) - t));
      float f = fbm(p * 1.1 + 2.8 * w);

      vec3 paper = vec3(0.988, 0.965, 0.960);
      vec3 blush = vec3(0.957, 0.835, 0.855);
      vec3 rose  = vec3(0.835, 0.580, 0.650);
      vec3 champ = vec3(0.955, 0.875, 0.800);
      vec3 lilac = vec3(0.900, 0.820, 0.900);

      vec3 col = mix(paper, blush, smoothstep(0.2, 0.75, f));
      col = mix(col, champ, smoothstep(0.35, 0.95, q.x) * 0.45);
      col = mix(col, lilac, smoothstep(0.45, 1.0, q.y) * 0.30);
      col = mix(col, rose, smoothstep(0.62, 1.05, length(w) * f) * (0.45 + 0.25 * uEnergy));

      // 絲綢高光：沿等值線的細亮帶
      float band = abs(fract(f * 4.0 + t * 0.5) - 0.5);
      col += (0.05 + 0.06 * uEnergy) * smoothstep(0.12, 0.0, band) * smoothstep(0.3, 0.8, f);

      // 中央留白，讓文字更易讀
      col = mix(col, paper, 0.26 * exp(-dot(p, p) * 2.6));

      gl_FragColor = vec4(col, 1.0);
    }`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn("[fluid]", err);
    canvas.classList.add("is-fallback");
    window.fluid = { setEnergy() {} };
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uMouse = gl.getUniformLocation(prog, "uMouse");
  const uEnergy = gl.getUniformLocation(prog, "uEnergy");

  // 以較低解析度渲染（畫面本身柔和，肉眼看不出），大幅降低 GPU 負擔
  const SCALE = 0.45;
  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const mouse = { x: 0.62, y: 0.42, tx: 0.62, ty: 0.42 };
  let energy = 0, targetEnergy = 0;
  let time = Math.random() * 100;
  let last = performance.now();
  let visible = true;
  let raf = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    energy += (targetEnergy - energy) * Math.min(1, dt * 2.2);
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 1.6);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 1.6);
    time += dt * (1 + energy * 1.5);

    resize();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uEnergy, energy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!calm && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else raf = 0;
  }

  function start() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / r.width;
    mouse.ty = 1 - (e.clientY - r.top) / r.height; // WebGL 的 y 軸向上
  }, { passive: true });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => !document.hidden && start());
  addEventListener("resize", () => calm && requestAnimationFrame(frame));

  window.fluid = {
    setEnergy(v) {
      targetEnergy = Math.max(0, Math.min(1, v));
      start();
    },
  };

  start();
})();
