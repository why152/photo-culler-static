// Experimental scoring only. The normal Worker remains the production backend.
// Exact integer partials avoid f32 variance cancellation and accumulation drift.
import { scorePixels, scoreStatistics } from "./photo-analysis-worker.js";

const STAT_WORDS = 42;
const STAT_BYTES = STAT_WORDS * 4;
const MAX_EDGE = 1600;

function validatePixels(pixels, width, height) {
  validateDimensions(width, height);
  if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) ||
    pixels.byteLength !== width * height * 4) throw new Error("Expected RGBA byte data matching dimensions");
}

function validateDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    width > MAX_EDGE || height > MAX_EDGE) throw new Error("Experimental analysis dimensions must be 1..1600");
}

// Every non-half weighted RGB value is at least .001 from a rounding boundary.
// Half values can round down in the JS binary64 reference. For each R/G pair,
// 114*B == 500-299*R-587*G (mod 1000) has at most one B in [0,255]: its period
// is 500 and 193 is the inverse of 57 modulo 500. One correction bit per pair
// therefore reproduces the original Math.round using just 8 KiB, built once.
export function grayscaleTieCorrections() {
  const bits = new Uint32Array(2048);
  for (let red = 0; red < 256; red += 1) {
    for (let green = 0; green < 256; green += 1) {
      const residue = ((500 - 299 * red - 587 * green) % 1000 + 1000) % 1000;
      if (residue % 2) continue;
      const blue = ((residue / 2) * 193) % 500;
      if (blue > 255) continue;
      const rounded = Math.floor((299 * red + 587 * green + 114 * blue + 500) / 1000);
      if (Math.round(red * 0.299 + green * 0.587 + blue * 0.114) < rounded) {
        const index = red * 256 + green;
        bits[index >>> 5] |= 1 << (index & 31);
      }
    }
  }
  return bits;
}

const SHADER = /* wgsl */ `
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: vec4u;
@group(0) @binding(2) var<storage, read> corrections: array<u32>;
@group(0) @binding(3) var<storage, read_write> partials: array<u32>;
@group(0) @binding(4) var<storage, read_write> totals: array<u32>;
var<workgroup> counts: array<atomic<u32>, 12>;
var<workgroup> sums: array<atomic<i32>, 10>;
var<workgroup> squares: array<atomic<u32>, 10>;

fn gray(point: vec2i) -> i32 {
  let rgb = vec3u(round(textureLoad(image, point, 0).rgb * 255.0));
  let numerator = 299u * rgb.r + 587u * rgb.g + 114u * rgb.b;
  var value = (numerator + 500u) / 1000u;
  if (numerator % 1000u == 500u) {
    let key = rgb.r * 256u + rgb.g;
    value -= (corrections[key / 32u] >> (key % 32u)) & 1u;
  }
  return i32(value);
}

fn accumulate(bin: u32, laplacian: i32) {
  atomicAdd(&counts[bin], 1u);
  atomicAdd(&sums[bin], laplacian);
  atomicAdd(&squares[bin], u32(laplacian * laplacian));
}

@compute @workgroup_size(256)
fn partial(@builtin(global_invocation_id) global: vec3u,
  @builtin(local_invocation_index) local: u32,
  @builtin(workgroup_id) group: vec3u) {
  if (local < 12u) { atomicStore(&counts[local], 0u); }
  if (local < 10u) {
    atomicStore(&sums[local], 0);
    atomicStore(&squares[local], 0u);
  }
  workgroupBarrier();
  let index = global.x;
  if (index < params.x * params.y) {
    let x = index % params.x;
    let y = index / params.x;
    let point = vec2i(i32(x), i32(y));
    let value = gray(point);
    if (value <= 8) { atomicAdd(&counts[10], 1u); }
    if (value >= 247) { atomicAdd(&counts[11], 1u); }
    if (x > 0u && x + 1u < params.x && y > 0u && y + 1u < params.y) {
      let laplacian = -4 * value + gray(point + vec2i(-1, 0)) +
        gray(point + vec2i(1, 0)) + gray(point + vec2i(0, -1)) + gray(point + vec2i(0, 1));
      let column = select(0u, 1u, x >= params.x / 3u) + select(0u, 1u, x >= (2u * params.x) / 3u);
      let row = select(0u, 1u, y >= params.y / 3u) + select(0u, 1u, y >= (2u * params.y) / 3u);
      accumulate(0u, laplacian);
      accumulate(1u + row * 3u + column, laplacian);
    }
  }
  workgroupBarrier();
  let offset = group.x * 42u;
  if (local < 10u) {
    partials[offset + local * 4u] = atomicLoad(&counts[local]);
    partials[offset + local * 4u + 1u] = bitcast<u32>(atomicLoad(&sums[local]));
    partials[offset + local * 4u + 2u] = atomicLoad(&squares[local]);
    partials[offset + local * 4u + 3u] = 0u;
  }
  if (local == 10u) { partials[offset + 40u] = atomicLoad(&counts[10]); }
  if (local == 11u) { partials[offset + 41u] = atomicLoad(&counts[11]); }
}

@compute @workgroup_size(16)
fn reduce(@builtin(global_invocation_id) global: vec3u) {
  let bin = global.x;
  if (bin >= 12u) { return; }
  var count = 0u;
  var sum = 0;
  var low = 0u;
  var high = 0u;
  for (var group = 0u; group < params.z; group += 1u) {
    let offset = group * 42u;
    if (bin < 10u) {
      count += partials[offset + bin * 4u];
      sum += bitcast<i32>(partials[offset + bin * 4u + 1u]);
      let next = low + partials[offset + bin * 4u + 2u];
      high += select(0u, 1u, next < low);
      low = next;
    } else {
      count += partials[offset + 40u + bin - 10u];
    }
  }
  if (bin < 10u) {
    totals[bin * 4u] = count;
    totals[bin * 4u + 1u] = bitcast<u32>(sum);
    totals[bin * 4u + 2u] = low;
    totals[bin * 4u + 3u] = high;
  } else { totals[40u + bin - 10u] = count; }
}
`;

function scoreStats(stats, width, height) {
  const signed = new Int32Array(stats.buffer, stats.byteOffset, stats.length);
  const variance = (bin) => {
    const offset = bin * 4;
    const count = stats[offset];
    if (count <= 1) return 0;
    const mean = signed[offset + 1] / count;
    const squared = stats[offset + 2] + stats[offset + 3] * 2 ** 32;
    return Math.max(0, squared / count - mean * mean);
  };
  let localVariance = 0;
  for (let bin = 1; bin <= 9; bin += 1) localVariance = Math.max(localVariance, variance(bin));
  return scoreStatistics(variance(0), localVariance, stats[40], stats[41], width * height);
}

export class ExperimentalGpuScorer {
  constructor({ gpu = globalThis.navigator?.gpu } = {}) {
    this.gpu = gpu;
    this.device = null;
    this.initializing = null;
    this.failure = null;
    this.closed = false;
    this.info = { available: false, adapterKind: "unavailable", readbackBytes: STAT_BYTES };
    this.tail = Promise.resolve();
  }

  async initialize() {
    if (!this.initializing) this.initializing = this.#initialize();
    return this.initializing;
  }

  async #initialize() {
    const start = performance.now();
    try {
      if (this.closed || !this.gpu) throw new Error("WebGPU unavailable");
      const adapter = await this.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter");
      const adapterInfo = adapter.info ?? {};
      const description = `${adapterInfo.vendor ?? ""} ${adapterInfo.architecture ?? ""} ${adapterInfo.device ?? ""} ${adapterInfo.description ?? ""}`;
      const fallback = adapterInfo.isFallbackAdapter ?? adapter.isFallbackAdapter;
      const software = fallback === true || /swiftshader|software|llvmpipe/i.test(description);
      this.info = { ...this.info, vendor: adapterInfo.vendor ?? "", architecture: adapterInfo.architecture ?? "",
        device: adapterInfo.device ?? "", description: adapterInfo.description ?? "",
        adapterKind: software ? "software" : fallback === false ? "hardware" : "unknown",
        timestampQuery: adapter.features.has("timestamp-query") };
      const device = await adapter.requestDevice();
      this.device = device;
      if (this.closed) throw new Error("WebGPU scorer closed");
      device.lost.then((loss) => {
        this.failure = new Error(`WebGPU device lost: ${loss.message || loss.reason}`);
        this.info.available = false;
      });
      device.pushErrorScope("validation");
      const module = device.createShaderModule({ code: SHADER });
      this.partialPipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "partial" } });
      this.reducePipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "reduce" } });
      const compilationError = await device.popErrorScope();
      if (compilationError) throw new Error(compilationError.message);
      const corrections = grayscaleTieCorrections();
      this.correctionBuffer = device.createBuffer({ size: corrections.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(this.correctionBuffer, 0, corrections);
      if (this.closed || this.failure) throw this.failure ?? new Error("WebGPU scorer closed");
      this.info.available = true;
    } catch (error) {
      this.failure = error;
      this.info.available = false;
      this.info.reason = error.message;
      this.correctionBuffer?.destroy();
      this.device?.destroy();
    }
    this.info.initializationMs = performance.now() - start;
    return { ...this.info };
  }

  // Serial jobs keep error scopes ordered and device resources bounded.
  scorePixels(pixels, width, height) {
    return this.#enqueue(() => this.#score(width, height, (texture) => {
      validatePixels(pixels, width, height);
      this.device.queue.writeTexture({ texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
    }));
  }

  // Pass the same sRGB Canvas used by the CPU reference to preserve alpha and
  // color-space semantics. Opaque ImageBitmap is also supported for experiments.
  scoreSource(source, width = source?.width, height = source?.height) {
    return this.#enqueue(() => this.#score(width, height, (texture) => {
      this.device.queue.copyExternalImageToTexture({ source },
        { texture, colorSpace: "srgb", premultipliedAlpha: false }, [width, height]);
    }));
  }

  #enqueue(job) {
    const result = this.tail.then(job);
    this.tail = result.catch(() => {});
    return result;
  }

  async #score(width, height, upload) {
    validateDimensions(width, height);
    await this.initialize();
    if (this.closed || this.failure || !this.info.available) throw this.failure ?? new Error("WebGPU scorer closed");
    const device = this.device;
    const resources = [];
    const makeBuffer = (size, usage) => {
      const resource = device.createBuffer({ size, usage });
      resources.push(resource);
      return resource;
    };
    const start = performance.now();
    device.pushErrorScope("validation");
    let scopeActive = true;
    try {
      const groups = Math.ceil(width * height / 256);
      const texture = device.createTexture({ size: [width, height], format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      resources.push(texture);
      const uniform = makeBuffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      device.queue.writeBuffer(uniform, 0, new Uint32Array([width, height, groups, 0]));
      const partials = makeBuffer(groups * STAT_BYTES, GPUBufferUsage.STORAGE);
      const totals = makeBuffer(STAT_BYTES, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readback = makeBuffer(STAT_BYTES, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      upload(texture);
      const uploaded = performance.now();
      const partialBindings = device.createBindGroup({ layout: this.partialPipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: texture.createView() }, { binding: 1, resource: { buffer: uniform } },
        { binding: 2, resource: { buffer: this.correctionBuffer } }, { binding: 3, resource: { buffer: partials } },
      ] });
      const reduceBindings = device.createBindGroup({ layout: this.reducePipeline.getBindGroupLayout(0), entries: [
        { binding: 1, resource: { buffer: uniform } }, { binding: 3, resource: { buffer: partials } },
        { binding: 4, resource: { buffer: totals } },
      ] });
      const encoder = device.createCommandEncoder();
      let pass = encoder.beginComputePass();
      pass.setPipeline(this.partialPipeline);
      pass.setBindGroup(0, partialBindings);
      pass.dispatchWorkgroups(groups);
      pass.end();
      pass = encoder.beginComputePass();
      pass.setPipeline(this.reducePipeline);
      pass.setBindGroup(0, reduceBindings);
      pass.dispatchWorkgroups(1);
      pass.end();
      encoder.copyBufferToBuffer(totals, 0, readback, 0, STAT_BYTES);
      device.queue.submit([encoder.finish()]);
      const submitted = performance.now();
      await readback.mapAsync(GPUMapMode.READ);
      const stats = new Uint32Array(readback.getMappedRange()).slice();
      readback.unmap();
      const validationError = await device.popErrorScope();
      scopeActive = false;
      if (validationError) throw new Error(validationError.message);
      const result = scoreStats(stats, width, height);
      return { result, backend: "webgpu-experimental", timings: {
        totalMs: performance.now() - start, setupUploadMs: uploaded - start,
        encodeSubmitMs: submitted - uploaded, waitReadbackMs: performance.now() - submitted,
      }, readbackBytes: STAT_BYTES };
    } catch (error) {
      // Always drain the scope even if upload/map failed before validation.
      if (scopeActive) {
        // popErrorScope can itself reject after a device loss; preserve error.
        try { await device.popErrorScope(); } catch {}
      }
      throw error;
    } finally {
      resources.forEach((resource) => resource.destroy());
    }
  }

  async scorePixelsOrCpu(pixels, width, height) {
    validatePixels(pixels, width, height);
    try { return await this.scorePixels(pixels, width, height); }
    catch (error) {
      const start = performance.now();
      return { result: scorePixels(pixels, width, height), backend: "cpu-fallback",
        fallbackReason: error.message, timings: { totalMs: performance.now() - start } };
    }
  }

  close() {
    this.closed = true;
    this.info.available = false;
    this.correctionBuffer?.destroy();
    this.device?.destroy();
  }
}
