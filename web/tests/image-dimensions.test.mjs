import test from "node:test";
import assert from "node:assert/strict";
import { imageDimensions, dimensionsWithin, orientedDimensions } from "../modules/image-dimensions.js";
import { decodeBitmap } from "../modules/photo-analysis-worker.js";

const text = (value) => [...new TextEncoder().encode(value)];
const u32 = (value) => [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255];
const le32 = (value) => u32(value).reverse();
function tiff(orientation) { return [73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]; }
function jpeg(width, height, orientation = 1) {
  const metadata = [...text("Exif\0\0"), ...tiff(orientation)];
  return new Blob([new Uint8Array([255,216,255,225,0,metadata.length + 2,...metadata,
    255,192,0,17,8,height >> 8,height & 255,width >> 8,width & 255,3,1,17,0,2,17,1,3,17,1,255,218])]);
}
function pngChunk(kind, data) { return [...u32(data.length), ...text(kind), ...data, 0,0,0,0]; }
function png(width, height, orientation = 1) { return new Blob([new Uint8Array([
  137,80,78,71,13,10,26,10,...pngChunk("IHDR", [...u32(width),...u32(height),8,2,0,0,0]),
  ...pngChunk("IDAT", [0]),...pngChunk("eXIf", tiff(orientation)),...pngChunk("IEND", []),
])]); }
function webpChunk(kind, data) { return [...text(kind),...le32(data.length),...data,...(data.length & 1 ? [0] : [])]; }
function webp(width, height, orientation = 1, extra = []) {
  const w = width - 1, h = height - 1;
  const body = [...text("WEBP"),...webpChunk("VP8X", [8,0,0,0,w&255,w>>8&255,w>>16&255,h&255,h>>8&255,h>>16&255]),
    ...webpChunk("EXIF", tiff(orientation)),...extra];
  return new Blob([new Uint8Array([...text("RIFF"),...le32(body.length),...body])]);
}

test("JPEG, PNG and WebP dimensions include EXIF rotations, even after image-data chunks", async () => {
  for (const make of [jpeg,png,webp]) {
    assert.deepEqual(await imageDimensions(make(6000,4000,6)), { width:6000,height:4000,orientation:6 });
  }
  assert.deepEqual(orientedDimensions({width:6000,height:4000,orientation:6}), { width:4000,height:6000 });
  assert.deepEqual(dimensionsWithin(1600,4000,6000), {width:1067,height:1600});
  assert.deepEqual(dimensionsWithin(1600,400,600), {width:400,height:600});
});

test("malformed and excessively segmented metadata safely falls back", async () => {
  assert.equal(await imageDimensions(new Blob(["not an image"])), null);
  assert.equal(await imageDimensions(jpeg(6000,4000).slice(0,25)), null);
  assert.equal(await imageDimensions(webp(6000,4000).slice(0,25)), null);
  const chunks = Array.from({length:257}, () => webpChunk("JUNK", [])).flat();
  assert.equal(await imageDimensions(webp(6000,4000,1,chunks)), null);
});

test("late PNG metadata reuses one bounded read window rather than reading every small chunk", async () => {
  const encoded = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,
    ...pngChunk("IHDR", [...u32(6000),...u32(4000),8,2,0,0,0]),
    ...pngChunk("IDAT", new Uint8Array(132000)),
    ...Array.from({length:100},()=>pngChunk("tEXt",[0])).flat(),
    ...pngChunk("eXIf",tiff(8)),...pngChunk("IEND",[]),
  ])]);
  const reads = [];
  const file = {size:encoded.size,slice:(start,end)=>{reads.push(end-start);return encoded.slice(start,end);}};
  assert.deepEqual(await imageDimensions(file),{width:6000,height:4000,orientation:8});
  assert.equal(reads.length,2);
  assert.ok(reads.every((length)=>length<=128*1024));
});

test("native decode fits both portrait axes and never enlarges small byte-heavy images", async () => {
  const original = globalThis.createImageBitmap;
  const options = [];
  globalThis.createImageBitmap = async (_file, option) => { options.push(option); return {}; };
  try {
    await decodeBitmap(jpeg(4000,6000));
    assert.equal(options[0].resizeWidth,1067); assert.equal(options[0].resizeHeight,1600);
    await decodeBitmap(jpeg(6000,4000,8));
    assert.equal(options[1].resizeWidth,1067); assert.equal(options[1].resizeHeight,1600);
    await decodeBitmap(new Blob([png(40,60),new Uint8Array(1_000_001)]));
    assert.equal(options[2].resizeWidth,undefined);
    await decodeBitmap(new Blob(["unknown"]));
    assert.equal(options.length,4);
  } finally { globalThis.createImageBitmap = original; }
});
