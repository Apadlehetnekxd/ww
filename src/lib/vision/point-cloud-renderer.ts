// Intentionally small structural WebGPU types: this app also targets browsers whose
// TypeScript DOM library predates WebGPU. Runtime capability detection is mandatory.
type GpuBuffer = { destroy(): void };
type GpuPass = { setPipeline(value: unknown): void; setVertexBuffer(index: number, value: GpuBuffer): void; setBindGroup(index: number, value: unknown): void; draw(vertices: number, instances: number): void; end(): void };
type GpuEncoder = { beginRenderPass(descriptor: unknown): GpuPass; finish(): unknown };
type GpuDevice = {
  queue: { writeBuffer(buffer: GpuBuffer, offset: number, data: ArrayBuffer, dataOffset?: number, size?: number): void; submit(commands: unknown[]): void };
  createBuffer(descriptor: unknown): GpuBuffer;
  createShaderModule(descriptor: unknown): unknown;
  createRenderPipelineAsync(descriptor: unknown): Promise<{ getBindGroupLayout(index: number): unknown }>;
  createBindGroup(descriptor: unknown): unknown;
  createCommandEncoder(): GpuEncoder;
  lost: Promise<{ reason: string }>;
  destroy(): void;
};
type GpuCanvasContext = { configure(descriptor: unknown): void; unconfigure(): void; getCurrentTexture(): { createView(): unknown } };
type GpuRuntime = { requestAdapter(options?: unknown): Promise<{ requestDevice(): Promise<GpuDevice> } | null>; getPreferredCanvasFormat(): string };

export interface PointCloudRenderer { render(points: Float32Array): void; dispose(): void }
const capacity = 64000;
const stride = 16;

function dimensions(canvas: HTMLCanvasElement) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round((rect.width || window.innerWidth) * pixelRatio));
  const height = Math.max(1, Math.round((rect.height || window.innerHeight) * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  return { width, height, pixelRatio };
}

const gpuShader = `
struct Screen { size: vec2f, ratio: f32, padding: f32 }
@group(0) @binding(0) var<uniform> screen: Screen;
struct Output { @builtin(position) position: vec4f, @location(0) local: vec2f, @location(1) alpha: f32 }
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @location(0) point: vec4f) -> Output {
  var corners = array<vec2f, 6>(vec2f(-1.,-1.), vec2f(1.,-1.), vec2f(-1.,1.), vec2f(-1.,1.), vec2f(1.,-1.), vec2f(1.,1.));
  let local = corners[vertex];
  let center = vec2f(point.x * 2. - 1., 1. - point.y * 2.);
  let radius = max(.9, point.w) * screen.ratio / screen.size;
  var result: Output;
  result.position = vec4f(center + local * radius, 0., 1.);
  result.local = local;
  result.alpha = point.z;
  return result;
}
@fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
  let alpha = (1. - smoothstep(.45, 1., length(input.local))) * input.alpha;
  return vec4f(1., 1., 1., alpha);
}`;

async function webGpu(canvas: HTMLCanvasElement): Promise<PointCloudRenderer | null> {
  const gpu = (navigator as Navigator & { gpu?: GpuRuntime }).gpu;
  if (!gpu) return null;
  let device: GpuDevice | null = null;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const format = gpu.getPreferredCanvasFormat();
    const module = device.createShaderModule({ code: gpuShader });
    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain', buffers: [{ arrayStride: stride, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list' },
    });
    // All async capability/pipeline checks precede binding the actual canvas.
    const context = canvas.getContext('webgpu' as '2d') as unknown as GpuCanvasContext | null;
    if (!context) { device.destroy(); return null; }
    context.configure({ device, format, alphaMode: 'opaque' });
    // WebGPU's stable numeric flag values: COPY_DST=8, VERTEX=32, UNIFORM=64.
    const vertices = device.createBuffer({ size: capacity * stride, usage: 8 | 32 });
    const screen = device.createBuffer({ size: 16, usage: 8 | 64 });
    const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: screen } }] });
    const activeDevice = device;
    let lost = false;
    void device.lost.then(() => { lost = true; });
    return {
      render(points) {
        if (lost) return;
        const { width, height, pixelRatio } = dimensions(canvas);
        const count = Math.min(capacity, points.length / 4);
        const uniforms = new Float32Array([width, height, pixelRatio, 0]);
        activeDevice.queue.writeBuffer(screen, 0, uniforms.buffer);
        if (count) activeDevice.queue.writeBuffer(vertices, 0, points.buffer as ArrayBuffer, points.byteOffset, count * stride);
        const encoder = activeDevice.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, vertices);
        pass.draw(6, count);
        pass.end();
        activeDevice.queue.submit([encoder.finish()]);
      },
      dispose() { lost = true; context.unconfigure(); vertices.destroy(); screen.destroy(); activeDevice.destroy(); },
    };
  } catch {
    device?.destroy();
    return null;
  }
}

function webGl(canvas: HTMLCanvasElement): PointCloudRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const compiled = gl.createShader(type)!;
    gl.shaderSource(compiled, source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) { gl.deleteShader(compiled); throw new Error('Point renderer shader unavailable.'); }
    return compiled;
  };
  const vertex = shader(gl.VERTEX_SHADER, `attribute vec4 point; uniform float pixelRatio; varying float alpha;
    void main(){ gl_Position=vec4(point.x*2.0-1.0,1.0-point.y*2.0,0.0,1.0); gl_PointSize=max(0.9,point.w)*pixelRatio; alpha=point.z; }`);
  const fragment = shader(gl.FRAGMENT_SHADER, `precision mediump float; varying float alpha;
    void main(){ float edge=1.0-smoothstep(0.2,0.5,length(gl_PointCoord-vec2(0.5))); gl_FragColor=vec4(1.0,1.0,1.0,alpha*edge); }`);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Point renderer could not initialize.');
  const buffer = gl.createBuffer()!;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, capacity * stride, gl.DYNAMIC_DRAW);
  const point = gl.getAttribLocation(program, 'point');
  const ratio = gl.getUniformLocation(program, 'pixelRatio');
  gl.enableVertexAttribArray(point);
  gl.vertexAttribPointer(point, 4, gl.FLOAT, false, stride, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 1);
  return {
    render(points) {
      if (gl.isContextLost()) return;
      const { width, height, pixelRatio } = dimensions(canvas);
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(ratio, pixelRatio);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const count = Math.min(capacity, points.length / 4);
      if (count) gl.bufferSubData(gl.ARRAY_BUFFER, 0, points.subarray(0, count * 4));
      gl.drawArrays(gl.POINTS, 0, count);
    },
    dispose() { gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); },
  };
}

export async function createPointCloudRenderer(canvas: HTMLCanvasElement): Promise<PointCloudRenderer> {
  const gpu = await webGpu(canvas);
  if (gpu) return gpu;
  const gl = webGl(canvas);
  if (gl) return gl;
  // Last-resort reduced renderer for devices that disable hardware acceleration.
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser could not start the camera visualization.');
  return {
    render(points) {
      const { width, height, pixelRatio } = dimensions(canvas);
      context.globalAlpha = 1;
      context.fillStyle = '#000';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#fff';
      const skip = Math.max(1, Math.ceil(points.length / 4 / 14000));
      for (let p = 0; p < points.length; p += 4 * skip) {
        context.globalAlpha = points[p + 2];
        const size = points[p + 3] * pixelRatio;
        context.fillRect(points[p] * width, points[p + 1] * height, size, size);
      }
    },
    dispose() {},
  };
}
