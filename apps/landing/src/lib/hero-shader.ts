const VERTEX = /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var pos = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pos[i], 0.0, 1.0);
}
`;

const FRAGMENT = /* wgsl */ `
struct Params {
  resolution: vec2f,
  time: f32,
};

@group(0) @binding(0) var<uniform> params: Params;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / params.resolution;
  let t = params.time;

  let grain = (hash(uv * params.resolution + t) - 0.5) * 0.08;
  let sweep = sin((uv.x + uv.y * 0.35 + t * 0.08) * 6.283) * 0.04;
  let chrome = vec3f(0.75 + sweep, 0.78, 0.82 + grain);
  let alpha = 0.22 + abs(sweep) * 0.35;

  return vec4f(chrome, alpha);
}
`;

export type HeroShaderHandle = {
  stop: () => void;
};

export async function startHeroShader(canvas: HTMLCanvasElement): Promise<HeroShaderHandle | null> {
  if (!("gpu" in navigator)) {
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) {
    return null;
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    return null;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  let size = { width: 0, height: 0 };

  const module = device.createShaderModule({ code: VERTEX + FRAGMENT });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: {
      module,
      entryPoint: "fs",
      targets: [{ format, blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      } }],
    },
    primitive: { topology: "triangle-list" },
  });

  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    size = {
      width: Math.max(1, Math.floor(canvas.clientWidth * dpr)),
      height: Math.max(1, Math.floor(canvas.clientHeight * dpr)),
    };
    canvas.width = size.width;
    canvas.height = size.height;
    context.configure({ device, format, alphaMode: "premultiplied" });
  };

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  const start = performance.now();

  const draw = () => {
    const time = (performance.now() - start) / 1000;
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([size.width, size.height, time, 0]),
    );

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    raf = requestAnimationFrame(draw);
  };

  draw();

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      device.destroy();
    },
  };
}