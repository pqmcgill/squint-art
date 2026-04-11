// gifuct-js 2.1.2 — browser bundle
(function() {
  var modules = {};
  function require(id) { return modules[id]; }

  // deinterlace
  (function() {
    var exports = modules['./deinterlace'] = {};
    "use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deinterlace = void 0;

/**
 * Deinterlace function from https://github.com/shachaf/jsgif
 */
var deinterlace = function deinterlace(pixels, width) {
  var newPixels = new Array(pixels.length);
  var rows = pixels.length / width;

  var cpRow = function cpRow(toRow, fromRow) {
    var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
    newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
  }; // See appendix E.


  var offsets = [0, 4, 2, 1];
  var steps = [8, 8, 4, 2];
  var fromRow = 0;

  for (var pass = 0; pass < 4; pass++) {
    for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
      cpRow(toRow, fromRow);
      fromRow++;
    }
  }

  return newPixels;
};

exports.deinterlace = deinterlace;
  })();

  // lzw
  (function() {
    var exports = modules['./lzw'] = {};
    "use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.lzw = void 0;

/**
 * javascript port of java LZW decompression
 * Original java author url: https://gist.github.com/devunwired/4479231
 */
var lzw = function lzw(minCodeSize, data, pixelCount) {
  var MAX_STACK_SIZE = 4096;
  var nullCode = -1;
  var npix = pixelCount;
  var available, clear, code_mask, code_size, end_of_information, in_code, old_code, bits, code, i, datum, data_size, first, top, bi, pi;
  var dstPixels = new Array(pixelCount);
  var prefix = new Array(MAX_STACK_SIZE);
  var suffix = new Array(MAX_STACK_SIZE);
  var pixelStack = new Array(MAX_STACK_SIZE + 1); // Initialize GIF data stream decoder.

  data_size = minCodeSize;
  clear = 1 << data_size;
  end_of_information = clear + 1;
  available = clear + 2;
  old_code = nullCode;
  code_size = data_size + 1;
  code_mask = (1 << code_size) - 1;

  for (code = 0; code < clear; code++) {
    prefix[code] = 0;
    suffix[code] = code;
  } // Decode GIF pixel stream.


  var datum, bits, count, first, top, pi, bi;
  datum = bits = count = first = top = pi = bi = 0;

  for (i = 0; i < npix;) {
    if (top === 0) {
      if (bits < code_size) {
        // get the next byte
        datum += data[bi] << bits;
        bits += 8;
        bi++;
        continue;
      } // Get the next code.


      code = datum & code_mask;
      datum >>= code_size;
      bits -= code_size; // Interpret the code

      if (code > available || code == end_of_information) {
        break;
      }

      if (code == clear) {
        // Reset decoder.
        code_size = data_size + 1;
        code_mask = (1 << code_size) - 1;
        available = clear + 2;
        old_code = nullCode;
        continue;
      }

      if (old_code == nullCode) {
        pixelStack[top++] = suffix[code];
        old_code = code;
        first = code;
        continue;
      }

      in_code = code;

      if (code == available) {
        pixelStack[top++] = first;
        code = old_code;
      }

      while (code > clear) {
        pixelStack[top++] = suffix[code];
        code = prefix[code];
      }

      first = suffix[code] & 0xff;
      pixelStack[top++] = first; // add a new string to the table, but only if space is available
      // if not, just continue with current table until a clear code is found
      // (deferred clear code implementation as per GIF spec)

      if (available < MAX_STACK_SIZE) {
        prefix[available] = old_code;
        suffix[available] = first;
        available++;

        if ((available & code_mask) === 0 && available < MAX_STACK_SIZE) {
          code_size++;
          code_mask += available;
        }
      }

      old_code = in_code;
    } // Pop a pixel off the pixel stack.


    top--;
    dstPixels[pi++] = pixelStack[top];
    i++;
  }

  for (i = pi; i < npix; i++) {
    dstPixels[i] = 0; // clear missing pixels
  }

  return dstPixels;
};

exports.lzw = lzw;
  })();

  // index
  (function() {
    var exports = {};
    "use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.decompressFrames = exports.decompressFrame = exports.parseGIF = void 0;

var _gif = _interopRequireDefault(require("js-binary-schema-parser/lib/schemas/gif"));

var _jsBinarySchemaParser = require("js-binary-schema-parser");

var _uint = require("js-binary-schema-parser/lib/parsers/uint8");

var _deinterlace = require('./deinterlace');

var _lzw = require('./lzw');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var parseGIF = function parseGIF(arrayBuffer) {
  var byteData = new Uint8Array(arrayBuffer);
  return (0, _jsBinarySchemaParser.parse)((0, _uint.buildStream)(byteData), _gif["default"]);
};

exports.parseGIF = parseGIF;

var generatePatch = function generatePatch(image) {
  var totalPixels = image.pixels.length;
  var patchData = new Uint8ClampedArray(totalPixels * 4);

  for (var i = 0; i < totalPixels; i++) {
    var pos = i * 4;
    var colorIndex = image.pixels[i];
    var color = image.colorTable[colorIndex] || [0, 0, 0];
    patchData[pos] = color[0];
    patchData[pos + 1] = color[1];
    patchData[pos + 2] = color[2];
    patchData[pos + 3] = colorIndex !== image.transparentIndex ? 255 : 0;
  }

  return patchData;
};

var decompressFrame = function decompressFrame(frame, gct, buildImagePatch) {
  if (!frame.image) {
    console.warn('gif frame does not have associated image.');
    return;
  }

  var image = frame.image; // get the number of pixels

  var totalPixels = image.descriptor.width * image.descriptor.height; // do lzw decompression

  var pixels = (0, _lzw.lzw)(image.data.minCodeSize, image.data.blocks, totalPixels); // deal with interlacing if necessary

  if (image.descriptor.lct.interlaced) {
    pixels = (0, _deinterlace.deinterlace)(pixels, image.descriptor.width);
  }

  var resultImage = {
    pixels: pixels,
    dims: {
      top: frame.image.descriptor.top,
      left: frame.image.descriptor.left,
      width: frame.image.descriptor.width,
      height: frame.image.descriptor.height
    }
  }; // color table

  if (image.descriptor.lct && image.descriptor.lct.exists) {
    resultImage.colorTable = image.lct;
  } else {
    resultImage.colorTable = gct;
  } // add per frame relevant gce information


  if (frame.gce) {
    resultImage.delay = (frame.gce.delay || 10) * 10; // convert to ms

    resultImage.disposalType = frame.gce.extras.disposal; // transparency

    if (frame.gce.extras.transparentColorGiven) {
      resultImage.transparentIndex = frame.gce.transparentColorIndex;
    }
  } // create canvas usable imagedata if desired


  if (buildImagePatch) {
    resultImage.patch = generatePatch(resultImage);
  }

  return resultImage;
};

exports.decompressFrame = decompressFrame;

var decompressFrames = function decompressFrames(parsedGif, buildImagePatches) {
  return parsedGif.frames.filter(function (f) {
    return f.image;
  }).map(function (f) {
    return decompressFrame(f, parsedGif.gct, buildImagePatches);
  });
};

exports.decompressFrames = decompressFrames;
    window.gifuct = exports;
  })();
})();
