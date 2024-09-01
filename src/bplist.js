//
// bplist.js
// Core Foundation Project
//
// Created by Raweden. Wed Jul 25 2012
// Implemented by Raweden 2012-2024
//

/**
 * @module core.bplist
 *
 */
const kCFBinaryPlistMarkerUID = 0x80;
const kCFBinaryPlistMarkerArray = 0xA0;
const kCFBinaryPlistMarkerSet = 0xC0;
const kCFBinaryPlistMarkerDict = 0xD0;

const BPLIST_MARKER_NULL = 0x00;
const BPLIST_MARKER_FALSE = 0x08;
const BPLIST_MARKER_TRUE = 0x09;
const BPLIST_MARKER_FILL = 0x0F;
const BPLIST_MARKER_INT = 0x10;
const BPLIST_MARKER_REAL = 0x20;
const BPLIST_MARKER_DATE = 0x33;
const BPLIST_MARKER_DATA = 0x40;
const BPLIST_MARKER_ASCII_STRING = 0x50;
const BPLIST_MARKER_UNICODE_16_STRING = 0x60;
const BPLIST_MARKER_UID = 0x80;
const BPLIST_MARKER_ARRAY = 0xA0;
const BPLIST_MARKER_SET = 0xC0;
const BPLIST_MARKER_DICT = 0xD0;

const BPLIST_CLASS_KEY = "$cls";

/**
 * @private
 * 
 * Determines the number of bytes needed to represent a integer.
 *
 * @param  {int} n Integer for which you want to know it's byte size.
 * @return {int} A integer
 */
function intByteLength(n) {
    // JavaScript can't handle 64-bit ints natively.
    // TODO: hack it up anyway.
    // (n & 0xFFFFFFFF00000000) ? 8 : ...
    return ((n & 0xFFFF0000) ? 4 : ((n & 0xFF00) ? 2 : 1));
}

/**
 * @private
 * 
 * Returns the integer value as a hex string, for example: 0x00. This
 * method is used for dumping integers into the console.
 */
function toHex(n) {
    if (n < 16) return '0' + n.toString(16);
    return n.toString(16);
}

/**
 * This callback is displayed as part of the Requester class.
 * @callback CFBinaryPlistWriteArchiveFn
 * @param {Object} obj
 * @return {string} A string donating the class name, for no class return `null` or `undefined` to leave `$cls` dict key unset.
 */

/**
 * This callback is displayed as part of the Requester class.
 * @callback CFBinaryPlistReadUnarchiveFn
 * @param {object} obj
 * @return {object} A new instance of object derived class. Return 
 */


/**
 * Deserlizes a binary plist into JavaScript native objects.
 *
 * @param  {ArrayBuffer} rawData A ArrayBuffer object which represents the raw bytes.
 * @param  {int} byteOffset      A integer that specifices where the read of the binary plist should start. If not provided the reading start at 0.
 * @param  {int} byteLength      A integer that determines the length of bytes which should be read as a binary plist.
 * @param  {CFBinaryPlistReadUnarchiveFn} unarchiveFn
 * @return {Object} The root object in the plist.
 */
export function CFBinaryPlistRead(rawData, byteOffset, byteLength, unarchiveFn) {

    if (byteOffset === undefined || Number.isInteger(byteOffset) == false) {
        byteOffset = 0;
    }
    if (byteLength === undefined) {
        byteLength = rawData.byteLength - byteOffset;
    }

    let data = new DataView(rawData, byteOffset, byteLength);

    //
    if (isBPlistSignature(data, byteOffset) === false) {
         throw new Error('Not a binary plist!');
    }
    // incrementing for the first part of the header.
    byteOffset += 6;

    // checking version in the header: 0x30 and 0x30 ascii for '00'
    if (data.getUint8(byteOffset++) !== 0x30 || data.getUint8(byteOffset++) !== 0x30) { //
        throw new Error('Unsupported BinaryPlist Version');
    }

    // TODO: Check the trailer values to make sure they're sane

    let trailerOffset = data.byteLength - 32;
    let trailer = readTrailerChunk(data, trailerOffset);

    //console.log(trailer);

    if (trailer.rootObjectIdx != 0) {
        console.warn("unconventioal top level object index: " + trailer.rootObjectIdx);
    }

    let intsize = trailer.offsetIntSize;
    let count = trailer.objectCount;
    let offset_list = [];
    let bOffset = trailer.offsetTableOffset;
    let refnum = trailer.rootObjectIdx;
    let objects = [];

    // TODO: add objlist variable to temporary hold deserialized objcet to enable referencing.

    for (let i = 0; i < count; i++) {
        let value = readRefPointer(data, bOffset, intsize);
        bOffset += intsize;
        offset_list[i] = value;
    }

    trailer.offset_list = offset_list;

    //console.log("refnum: "+refnum);

    let root = readObjectRef(data, offset_list[refnum], trailer, objects, refnum, unarchiveFn);




    /*console.log(objects);

    // debuging (seams like there is unused enteries in the object table, lets check what those are)
    //return root;
    let unused = [];
    let unusedMapping = [];
    count = objects.length;

    for (let i = 0; i < count; i++) {
        if (objects[i] === undefined) {
            unused.push(i);
        }
    }

    count = unused.length;

    for (let i = 0; i < count; i++) {
        let refIdx = unused[i];
        unusedMapping[refIdx] = readObjectRef(data, offset_list[refIdx], trailer, objects, refIdx);
    }

    console.log("number-of-unused-enteries: " + unused.length);
    console.log(unusedMapping);
    */

    //console.log("alloacted ref table length: " + objects.length);
    //console.log(objects);
    //debugDumpObjectRefTable(objects);
    //console.log(readObjectRef(data, offset_list[80], trailer, objects, 80))
    //var root = parseObject(data, offset_list[rootObjectIdx], trailer);
    return root;
}



/**
 * @private
 *
 * Parses a object from the stream.
 *
 * @param {DataView} data      A DataView object which interfaces the ArrayBuffer instance.
 * @param {int}      offset    The offset which indicates the position from where to read.
 * @param {Object}   trailer   The trailer object containing key-value data, this is parsed in CFBinaryPlistRead().
 * @param {Array}    objects   A object table holding already serialized objects.
 * @param {int}      refnum    A integer value represeting the reference number of the object inside object table.
 * @return {Object} A JavaScript object.
 */
function readObjectRef(data, offset, trailer, objects, refnum, unarchiveFn) {
    let value = undefined;

    if (typeof refnum == "undefined") {
        refnum = -1;
    } else {
        value = objects[refnum];
        if (value !== undefined) {
            //console.log("retrived object at "+refnum+" from objects cache");
            return value;
        } else {
            value = null;   // reset to not affect the readed value.
        }
    }

    let len;
    let marker = data.getUint8(offset++);
    let type = marker & 0xF0;
    let hasUnarchiveFn = unarchiveFn !== undefined && typeof unarchiveFn == "function"

    switch (type) {
        // Boolean
        case 0x00:
            // reading the full marker uint_8 to get the one of three values (null, false, true).
            if (marker === 0x00) {
                value = null;
            } else if (marker === 0x08) {
                value = false;
            } else if (marker === 0x09) {
                value = true;
            }
            // are these ever used with object reference?
            if (refnum !== -1 && value !== undefined)
                objects[refnum] = value;
            break;
        // Integer
        case 0x10:
            len = Math.pow(2, marker & 0x0F);
            value = readInteger(data, offset, len);
            if (refnum !== -1)
                objects[refnum] = value;
            break;
        // Float
        case 0x20:
            len = Math.pow(2, marker & 0x0F);
            if (len == 4 || len == 8) {
                value = len == 4 ? data.getFloat32(offset) : data.getFloat64(offset);
                if (refnum !== -1)
                    objects[refnum] = value;
            } else {
                throw new Error("Can't read " + (8 * len) + "-bit float");
            }

            break;
        // Date
        case 0x30:
            // Represented by a 64-bit float, secounds relative to Jan 1 2001 00:00:00 GMT
            value = data.getFloat64(offset);
            value = CFDateSetAbsoluteTime(value);
            if (refnum !== -1)
                objects[refnum] = value;
            break;
        // Data Buffer read into native ArrayBuffer
        case 0x40:
            len = (marker & 0x0F);
            if (len == 0x0F) {
                // TODO: could be replaced by method that reads marked integers.
                len = readObjectRef(data, offset, trailer);
                offset += (1 + intByteLength(len));   // incrementing for the extra bytes read.
            }
            // When reading a Serialized Binary Data object, we need to copy it into a new ArrayBuffer, so that the
            // larger binary data we are deserializing from can be deallocated.
            let bOffset = data.byteOffset + offset;
            value = data.buffer.slice(bOffset, bOffset + len);
            if (refnum !== -1)
                objects[refnum] = value;
            break;
        // ASCCII
        case 0x50:
            len = (marker & 0x0F);
            if (len == 0x0F) {
                len = readObjectRef(data, offset, trailer);
                offset += (1 + intByteLength(len));   // incrementing for the extra bytes read.
            }
            value = readStringAscii(data, offset, len);
            //value = data.toString("ascii", offset, offset + len);
            if (refnum !== -1)
                objects[refnum] = value;
            break;
        // UTF-16
        case 0x60:{
            len = (marker & 0x0F);
            if (len == 0x0F) {
                len = readObjectRef(data, offset, trailer);
                offset += (1 + intByteLength(len));   // incrementing for the extra bytes read.
            }

            let str = "";
            let i16, idx = offset;
            let end = idx + (len * 2);  // len in this case are actually the number of chars (utf-16) so its times two.
            // reading UTF-16 string per character (no better way of doing it nativly in JavaScript?)
            while (idx < end) {
                i16 = data.getUint16(idx);
                str += String.fromCharCode(i16);
                idx += 2;
            }
            value = str;
            // setting reference if specified.
            if (refnum !== -1)
                objects[refnum] = value;
            break;
        }
        // UID
        case 0x80:
            len = (marker & 0x0F) + 1;
            // @todo: Are these read by the same concept as a integer? a signed 64-bit which allows negative value dont make sense for a uid.
            value = readCFUIDInteger(data, offset, len);
            // These UID (Unique Identifier) defines a object reference by a interger based value which is defined when using NSKeyedArchiver,
            // its common in serialized runtime object and in *.nib files. We can't realy do anything with them here, as they reference objects
            // in a array nested in the serialized output.
            //
            // We use a placeholder class for these type of objects, so they are easier spotted later.
            value = new CFKeyedArchiverUID(value);
            //value = Symbol(value);
            if (refnum !== -1)
                objects[refnum] = value;
            break;
        // Array
        case 0xA0:{
            len = (marker & 0x0F);
            if (len == 0x0F) {
                // TODO: could be replaced by reading marked integer i think.
                len = readObjectRef(data, offset, trailer);
                offset += (1 + intByteLength(len));   // incrementing for the extra bytes read.
            }
            let obj, objId, refSize = trailer.objectRefSize;
            let vOffset = offset;
            value = [];
            if (refnum !== -1) {
                objects[refnum] = value;
            }
            for (let i = 0;i < len;i++) {
                objId = readRefPointer(data, vOffset, refSize);
                vOffset += refSize;
                obj = readObjectRef(data, trailer.offset_list[objId], trailer, objects, objId, unarchiveFn);
                value.push(obj);
            }

            break;
        }
        // Set
        case 0xC0:{
            len = (marker & 0x0F);
            if (len == 0x0F) {
                // TODO: could be replaced by reading marked integer i think.
                len = readObjectRef(data, offset, trailer);
                offset += (1 + intByteLength(len));   // incrementing for the extra bytes read.
            }
            let obj, objId, refSize = trailer.objectRefSize;
            let vOffset = offset;
            value = new Set();
            if (refnum !== -1) {
                objects[refnum] = value;
            }
            for (let i = 0;i < len;i++) {
                objId = readRefPointer(data, vOffset, refSize);
                vOffset += refSize;
                obj = readObjectRef(data, trailer.offset_list[objId], trailer, objects, objId, unarchiveFn);
                value.add(obj);
            }

            break;
        }
        // Dictionary
        case 0xD0:{
            len = marker & 0x0F;
            // if length is `1111` a length integer follows.
            if (len == 0x0F) {
                // @todo: could be replaced by reading marked integer i think.
                len = readObjectRef(data, offset, trailer);
                offset += (1 + intByteLength(len));   // incrementing for the extra bytes read.
            }
            // @todo: NSDictionary Supports key value other than string, in some cases we need a map here.
            value = {};

            // if we are given a refnum (reference pointer) to fill, we better set it now.
            if (refnum !== -1) {
                objects[refnum] = value;
            }
            let keyId, key;
            let objId, obj;
            let refSize = trailer.objectRefSize;
            let kOffset = offset;                    // key offset (byteOffset to the key reference pointer).
            let vOffset = offset + (len * refSize);  // obj offset (byteOffset to the object reference pointer).
            for (let i = 0; i < len; i++) {
                // reading reference pointers to key and object.
                keyId = readRefPointer(data, kOffset, refSize);
                objId = readRefPointer(data, vOffset, refSize);
                kOffset += refSize;
                vOffset += refSize;
                // reading the actual key and object.
                key = readObjectRef(data, trailer.offset_list[keyId], trailer, objects, keyId, unarchiveFn);
                obj = readObjectRef(data, trailer.offset_list[objId], trailer, objects, objId, unarchiveFn);

                // implements unarchiver right in the de-serializer
                if (i == 0 && hasUnarchiveFn && refnum !== -1 && typeof key == "string" && key == BPLIST_CLASS_KEY) {
                    let replacement = unarchiveFn(obj);
                    if (replacement !== null && typeof replacement == "object") {
                        objects[refnum] = replacement;
                        value = replacement;
                        continue;
                    }
                }
                value[key] = obj;
            }
            break;
        }
        default:
            console.error("unknown value type: " + (marker & 0xF0));
            break;
    }

    return value;
}


//
// Utility Methods
//

/**
 * @private
 * 
 * @param {DataView} dataView 
 * @param {*} byteOffset 
 * @param {*} byteLength 
 * @returns 
 */
function readStringAscii(dataView, byteOffset, byteLength) {

    if (byteOffset < 0 || byteOffset > dataView.byteLength) {
        throw new RangeError("byteOffset is out of Range");
    }

    let i, len = byteOffset + byteLength;
    let b, str = "";
    for (i = byteOffset; i < len;i++) {
        b = dataView.getUint8(i);
        str += String.fromCharCode(b);
    }

    return str;
}

/**
 * @private
 * 
 * @param {DataView} dataView 
 * @param {*} offset 
 * @param {*} intsize 
 * @returns 
 */
function readInteger(dataView, offset, intsize) {
    switch (intsize) {
        case 1:
            return dataView.getUint8(offset);       // 1-byte integers are unsigned.
        case 2:
            return dataView.getUint16(offset);      // 2-bytes integers are unsigned.
        case 4:
            return dataView.getUint32(offset);      // 4-bytes integers are unsigned.
        case 8:
        {
            // since -1 is always encoded as Int64, this below is a hack to opt out of the explicit handling of BigInt in JavaScript.
            // like below every comparision with BigInt requires a bigint.. donated by the n suffix.
            let v = dataView.getBigInt64(offset);    // in 'bplist00' format 64-bit (8-byte) integers are always signed
            return (v <= 2147483647n && v >= -2147483648n) ? Number(v) : v;
        }
        default:
            throw new TypeError("can't read " + (8 * len) + "-bit integer");
            break;
    }
}

/**
 * @private
 * 
 * @param {DataView} dataView 
 * @param {*} offset 
 * @param {*} intsize 
 * @returns 
 */
function readCFUIDInteger(dataView, offset, intsize) {
    switch (intsize) {
        case 1:
            return dataView.getUint8(offset);       // 1-byte integers are unsigned.
        case 2:
            return dataView.getUint16(offset);      // 2-bytes integers are unsigned.
        case 4:
            return dataView.getUint32(offset);      // 4-bytes integers are unsigned.
        case 8:
            return dataView.getBigUint64(offset);    // 8-bytes integer are unsigned for UID's
        default:
            throw new TypeError("can't read " + (8 * len) + "-bit integer");
            break;
    }
}

/**
 * @private
 * 
 * Reads a reference pointer in the binary plist.
 *
 * @param  {Buffer} data A buffer reference from which to read.
 * @param  {int} offset  The offset of the reference pointer to read.
 * @param  {int} refsize The size specification of the reference pointer.
 * @return {integer} A integer value, representing the offset in the offset-table.
 */
function readRefPointer(data, offset, refsize) {
    switch (refsize) {
        case 1:
            return data.getUint8(offset);
        case 2:
            return data.getUint16(offset);
        case 4:
            return data.getUint32(offset);
        case 8:
            return data.getBigUint64(offset);
    }

    throw new Error("unsupported reference pointer as " + (8 * len) + "-bit int");
}

/**
 * @private
 * 
 * Reads the trailer chunk of the binary plist.
 *
 * @param  {Buffer} data A DataView reference on which to read, should be the starting offset of the first of the 5 unused bytes.
 * @return {Object} A object contaning important information for enable the reading of the binary plist.
 */
function readTrailerChunk(data, byteOffset) {
    let offset = byteOffset;

    offset += 5;
    let trailer = new CFBinaryPlistTrailer();
    trailer.sortVersion = data.getUint8(offset++);
    trailer.offsetIntSize = data.getUint8(offset++); // trailer.offsetIntSize
    trailer.objectRefSize = data.getUint8(offset++); // trailer.objectRefSize

    // as 64-bit integers can be used in every place a 32-bit can be used this reads them as 32-bit if possible.
    // > Even if JavaScript now have support for BigInt the DataView dont support them as byteOffset.
    // in many cases these 64-bit integers are only use the 32-bit range anyways.

    // trailer.objectCount
    if (data.getUint32(offset) === 0) {
        trailer.objectCount = data.getUint32(offset + 4);  // trailer.objectCount
    } else {
        trailer.objectCount = data.getBigUint64(offset);  // trailer.objectCount

    }
    // incrementing for uint64
    offset += 8;

    // trailer.rootObjectIdx
    if (data.getUint32(offset) === 0) {
        trailer.rootObjectIdx = data.getUint32(offset + 4);
    } else {
        trailer.rootObjectIdx = data.getBigUint64(offset);

    }

    // incrementing for uint64
    offset += 8;
    // trailer.offsetTableOffset
    if (data.getUint32(offset) === 0) {
        trailer.offsetTableOffset = data.getUint32(offset + 4);
    } else {
        trailer.offsetTableOffset = data.getBigUint64(offset);

    }


    return trailer;
}

/**
 * Checks the 6-byte signature of the binary plist, and returns true if the bytes at byteOffset matches that signature.
 *
 * @param  {DataView}  data     A standard DataView interface to a binary buffer.
 * @param  {int}  byteOffset    A integer value that specifices where in the data to check for the signature. The default location is `0` if unspecified.
 * @return {Boolean}            A Boolean value that determines whether the data at byteOffset matches the signature of a BinaryPlist.
 */
export function isBPlistSignature(data, byteOffset) {
    if (!Number.isInteger(byteOffset)) {
        byteOffset = 0;
    }

    if (data.getUint8(byteOffset++) == 0x62 &&
       data.getUint8(byteOffset++) == 0x70 &&
       data.getUint8(byteOffset++) == 0x6C &&
       data.getUint8(byteOffset++) == 0x69 &&
       data.getUint8(byteOffset++) == 0x73 &&
       data.getUint8(byteOffset++) == 0x74) {
        return true;
    }

    return false
}


// CFDate Utilities


/**
 * @private
 *  
 * Creates a Date instance which represents the time from CF Abosolute time.
 *
 * @param {Number} absoluteTime The number of secounds relative to Jan 1 2001 00:00:00 GMT
 * @return {Date}
 */
function CFDateSetAbsoluteTime(absoluteTime) {
    var time = 978307200000;  // relation to unix epoc in millisecounds.
    time = time  + (absoluteTime * 1000);
    return new Date(time);
}

/**
 * @private
 *  
 * @param {Date}
 * @return {Number} The CF Absolute time value (down to millisecounds precision).
 */
function CFDateGetAbsoluteTime(date) {
    var time = 978307200000;  // relation to unix epoc in millisecounds.
    time = date.getTime() - time;
    return time / 1000;
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////
// Writting Binary Plist
/////////////////////////////////////////////////////////////////////////////////////////////////////////


/**
 * @private
 * 
 * Returns a Boolean value that indicates whether the value is a integer value.
 *
 * @param  {Number} value A integer value represented nativly as a Number.
 * @return {Boolean} `true` if the specified `value` is a integer, oterwise `false`.
 */
function isInt(value) {
    return isFinite(value) && value > -9007199254740992 && value < 9007199254740992 && Math.floor(value) === value;
}

/**
 * @private
 * 
 * Returns the Marker Integer for a JavaScript Native type.
 *
 * Note: for String this always returns the marker for ASCII, caller must self validate if the string requires UTF-16 or can be encoded as ASCII.
 *
 * Note that the marker retunred may also have the 4-bit length set after the marker in the following cases:
 * - When the JavaScript type is BigInt.
 * - When using CFIntegerRef to represent a integer.
 * - types translated to BPLIST_MARKER_DATE.
 *
 * @param  {id} obj [description]
 * @return {int}     [description]
 */
function getBPlistMarker(obj) {
    if (obj === null) {
        return BPLIST_MARKER_NULL;
    }

    let objType = typeof obj;

    if (objType == "boolean") {
        return obj === true ? BPLIST_MARKER_TRUE : BPLIST_MARKER_FALSE;
    } else if (objType == "number") {
        if (Number.isInteger(obj) == true) {
            if (obj < 0) { // negative integers are always emitted as int64.
                return BPLIST_MARKER_INT | 3;
            } else {
                return BPLIST_MARKER_INT | 0x0F; // indicates the length-pre-compute that auto-size the int.
            }
        } else if (isNaN(obj) == true) {
            throw new Error("Encounted NaN (Not-A-Number) while Serializing");
        } else {
            return BPLIST_MARKER_REAL;
        }
    } else if (objType == "bigint") {
        return BPLIST_MARKER_INT | 3; // marker 4-bit + length 4-bit value for 64-bit integer.
    } else if (objType == "string") {
        let marker = isASCIIString(obj) ? BPLIST_MARKER_ASCII_STRING : BPLIST_MARKER_UNICODE_16_STRING;
        return marker;
    } else if (objType == "object") {
        if (obj.isa) {
            // handle Objective-J instances separatly, however the archiver/unarchiver would not let these trough.
        } else if (obj instanceof CFIntegerRef) {
            return BPLIST_MARKER_INT; // @todo could add length 4-bit value for these too.
        } else if (obj instanceof Array) {
            return BPLIST_MARKER_ARRAY;
        } else if (obj instanceof Set) {
            return BPLIST_MARKER_SET;
        } else if (obj instanceof Map) {
            return BPLIST_MARKER_DICT;
        } else if (obj instanceof CFKeyedArchiverUID) {
            return BPLIST_MARKER_UID;
        }

        // JavaScript Date object

        if (obj instanceof Date) {
            return BPLIST_MARKER_DATE;
        }

        // Binary Types (As there is many TypedArray kinds and the runtime might not have all of them, we just check for the buffer property which are common to them all).

        if (obj instanceof ArrayBuffer) {
            return BPLIST_MARKER_DATA;
        } else if (obj.buffer instanceof ArrayBuffer) {
            return BPLIST_MARKER_DATA;
        }


        // If no other case matched, then we return the Dictionary marker for the object.

        return BPLIST_MARKER_DICT;
    } else if (objType == "function") {
        throw new Error("Encounted Function while Serializing");
    } else if (objType == "symbol") {
        throw new Error("Encounted Symbol while Serializing");
    }
}


/**
 * @private
 *
 * @param  {DataView} buffer A DataView that interfaces a underlaying ArrayBuffer.
 * @param  {Int} byteOffset  The offset where the integer with marker should be written.
 * @param  {Int} value       The integer value to be written
 * @return {Int} The number of bytes that where written. marker+integer
 */
function appendInt(buffer, byteOffset, value) {
    var marker;
    var offset;  // number of bytes.
    if (value <= 0xFF) {
        offset = 2;  // 8-bit marker + 8-bit
        marker = 0x10 | 0;
        buffer.setUint8(byteOffset++, marker);
        buffer.setUint8(byteOffset++, value);
    } else if (value <= 0xFFFF) {
        offset = 3;  // 8-bit marker + 16-bit
        marker = 0x10 | 1;
        buffer.setUint8(byteOffset++, marker);
        buffer.setUint16(byteOffset, value);
    } else if (value <= 0xFFFFFF) {
        offset = 5;  // 8-bit marker + 32-bit
        marker = 0x10 | 2;
        buffer.setUint8(byteOffset++, marker);
        buffer.setUint32(byteOffset, value);
    } else {
        offset = 9;  // 8-bit marker + 64-bit
        marker = 0x10 | 3;
        buffer.setUint8(byteOffset++, marker);
        buffer.setUint64(byteOffset, value); // @todo are this written as signed?
    }


    return offset;
}





/**
 * @private
 * @constructor
 */
function CFBinaryPlistTrailer() {
    this.sortVersion = 0;
    this.offsetIntSize = 0;
    this.objectRefSize = 0;
    this.objectCount = 0;
    this.rootObjectIdx = 0;
    this.offsetTableOffset = 0;
}

let _UID = 0;

export class CFKeyedArchiverUID {

    constructor (val) {
        this.uid = val;
        this.__objUID = _UID++;
    }
};



/**
 * @private
 *
 * Evaulates the number of bytes required to encode the given object.
 *
 * This is done by traverse the whole object structure. Using this method also generates the marker-byte for each object.
 *
 * @param  {Array} objlist  [description]
 * @param  {Array} markerlist [description]
 * @param  {Object} trailer [description]
 * @return {Int} [description]
 */
function computeBPlistByteLength(objlist, markerlist, trailer) {
    let byteCount = 0;
    let refCount = 0;
    //let refOffsetSize = 4;    // number of bytes used for the integer that used for referencing objects.

    // header
    byteCount += 8;

    const TYPE_BITS = 0xF0;
    const LEN_BITS = 0x0F;

    let objCount = objlist.length;
    for (let idx = 0;idx < objCount; idx++) {
        let obj = objlist[idx];
        let marker = markerlist[idx]; // getBPlistMarker(obj);
        let l4 = 0x0F;  // length-bits 0x00 - 0x0F (0x0F indicating that len int follows).

        if (marker == BPLIST_MARKER_NULL || marker == BPLIST_MARKER_FALSE || marker == BPLIST_MARKER_TRUE) {
            byteCount += 1; // only increment for the size of the marker.
            //markerlist[idx] = marker;
        } else if (marker == 0x10) { // 8-bit integers.
            byteCount += 2;
            //markerlist[idx] = marker;
        } else if (marker == 0x11) { // 16-bit integers.
            byteCount += 3;
            //markerlist[idx] = marker;
        } else if (marker == 0x12) { // 32-bit integers.
            byteCount += 5;
            //markerlist[idx] = marker;
        } else if (marker == 0x13) { // 64-bit integers.
            byteCount += 9;
            //markerlist[idx] = marker;
        } else if (marker === 0x1F) { // Auto-Sized integers.
            let byteSize = intByteLength(obj);
            if (byteSize === 1) {
                l4 = 0x00;
                byteCount += 2; // marker + 8-bit integer
            } else if (byteSize === 2) {
                l4 = 0x01;
                byteCount += 3; // marker + 16-bit integer
            } else if (byteSize === 4) {
                l4 = 0x02;
                byteCount += 5; // marker + 32-bit integer
            } else if (byteSize === 8) {
                l4 = 0x03;
                byteCount += 2; // marker + 64-bit integer
            } else {
                console.error("unsupported integer as " + (8 * byteSize) + "-bit int");
            }

            markerlist[idx] = BPLIST_MARKER_INT | l4;
        } else if (marker == BPLIST_MARKER_REAL) {
            byteCount += 9; // marker + 64-bit float
            l4 = 8;

            markerlist[idx] = BPLIST_MARKER_REAL | 0x03;
        } else if (marker == BPLIST_MARKER_DATE) {
            byteCount += 9; // marker + 64-bit double

            markerlist[idx] = BPLIST_MARKER_DATE;
        } else if (marker == BPLIST_MARKER_DATA) {
            let byteSize = obj.byteLength;
            // if len < 15 then we dont need an extra integer to hold the length.
            if (byteSize < 15) {  // 0-14, 0x0F is resvered for following int.
                byteCount += (1 + byteSize);
                l4 = byteSize;
            } else {
                let intSize = intByteLength(byteSize);
                byteCount += (2 + intSize + byteSize);
            }

            markerlist[idx] = BPLIST_MARKER_DATA | l4;
        } else if (marker == BPLIST_MARKER_ASCII_STRING) {
            let len = obj.length;
            // if len < 15 then we dont need an extra integer to hold the length.
            // else 1+intSize one additinal marker of int type and the number of bytes taken up by that int.
            let intSize = 0;
            if (len < 15) {
                l4 = len;
                byteCount += (1 + len);            // marker + string-bytes.
            } else {
                intSize = intByteLength(len);
                byteCount += (2 + intSize + len);  // marker + int-marker + integer-bytes + string-bytes.
            }

            // update the length as its not set by the getBPlistMarker() function.
            markerlist[idx] = marker | l4;
        } else if (marker == BPLIST_MARKER_UNICODE_16_STRING) {
            let len = obj.length;
            let byteSize = obj.length * 2;
            // if len < 15 then we dont need an extra integer to hold the length.
            // else 1+intSize one additinal marker of int type and the number of bytes taken up by that int.
            if (len < 15) {
                l4 = len;
                byteCount += (1 + byteSize);            // marker + string-bytes.
            } else {
                let intSize = intByteLength(len);
                byteCount += (2 + intSize + byteSize);  // marker + int-marker + integer-bytes + string-bytes.
            }

            markerlist[idx] = marker | l4;
        } else if (marker == BPLIST_MARKER_UID) {
            let n;
            if (obj <= 0xFF) {
                n = 1;
            } else if (obj <= 0xFFFF) {
                n = 2;
            } else if (obj <= 0xFFFFFFFF) {
                n = 4;
            } else {
                n = 8;
            }
            l4 = n - 1; // length 4-bit + 1 is the number of bytes.
            byteCount += (n + 1);   // marker + int-bytes
            markerlist[idx] = marker | l4;
        } else if (marker == BPLIST_MARKER_ARRAY || marker == BPLIST_MARKER_SET) {
            let len = obj.length;
            if (len < 15) {
                l4 = len;
                byteCount += 1;
            } else {
                let intSize = intByteLength(len);
                byteCount += (2 + intSize);
            }
            refCount += len;
            markerlist[idx] = marker | l4;
        } else if (marker == BPLIST_MARKER_DICT) {
            let pairs = obj.length * 0.5;
            if (pairs !== pairs | 0) {
                throw new Error("InvalidStateError key-value-pair is not even");
            }
            let len = obj.length;
            if (pairs < 15) {
                l4 = pairs;
                byteCount += 1;
            } else {
                let intSize = intByteLength(pairs);
                byteCount += (2 + intSize);
            }
            refCount += len;
            markerlist[idx] = marker | l4;
        }
    }

    let offsetIntSize = intByteLength(byteCount);
    let objectRefSize = intByteLength(refCount);

    console.log("offsetIntSize: %i objectRefSize: %i", offsetIntSize, objectRefSize);

    // appending bytes used by the reference table.
    byteCount += (offsetIntSize * objCount);
    // appending bytes used by Array, Set and Dictionary to reference values and keys.
    byteCount += (objectRefSize * refCount);

    // trailer chunk
    byteCount += 32;

    // setting values in the trailer chunk.
    trailer.offsetIntSize = offsetIntSize;
    trailer.objectRefSize = objectRefSize;

    return byteCount;
}

/**
 * Returns a Boolean value that indicates if a string is within the ASCII character range.
 *
 * @param  {String} str
 * @return {Boolean} A boolean true if the string can be encoded as a ASCII string. Otherwise false.
 */
export function isASCIIString(str) {
    let len = str.length;

    for (let i = 0; i < len; i++) {
        let c = str.charCodeAt(i);
        if (c >= 0x80) {
            return false;
        }
    }

    return true;
}


/**
 * @public
 *
 * Encodes a object structure.
 *
 * @param {object} plist
 * @param {CFBinaryPlistWriteArchiveFn} archiveFn A optional callback that is used to donate class names for encoded objects.
 * @return {ArrayBuffer} A binary buffer representing the serialized data of the object structure.
 */
export function CFBinaryPlistWrite(plist, archiveFn) {
    let objlist = [];
    let markerList = [];
    let offsets = [];
    let trailer = new CFBinaryPlistTrailer();
    let objRefMap = new Map();      // All items in this array should be uniqe
    let uniqeUIDMap = new Map();    // CFUID.uid -> CFUID object ref.

    let byteOffset = 0;     //
    let idx, idx2, objCount;

    let topObjectIdx = getFlatObjectLists(plist, objlist, markerList, objRefMap, uniqeUIDMap, archiveFn);
    objRefMap.clear();      // these maps is no longer needed.
    uniqeUIDMap.clear();

    let byteLength = computeBPlistByteLength(objlist, markerList, trailer);

    console.log("CFBinaryPlistWrite::byteLength = " + byteLength);

    // setting local in scope references for some values in the trailer povided by the computation of the buffers size.
    let offsetIntSize = trailer.offsetIntSize;
    let objectRefSize = trailer.objectRefSize;
    objCount = objlist.length;

    // updating some trailer properties gather trough pre write compitation.
    trailer.objectCount = objCount;
    trailer.rootObjectIdx = topObjectIdx;   // should in all cases be 0, but for the case of future change.

    //console.log(objlist);
    //debugObjectTable(objlist, markerList);

    //console.log("fattern object count is: " + objCount);

    let bytes = new ArrayBuffer(byteLength);
    let buffer = new DataView(bytes);

    // Writing the File signature
    buffer.setUint8(byteOffset++, 0x62); // bplist
    buffer.setUint8(byteOffset++, 0x70);
    buffer.setUint8(byteOffset++, 0x6C);
    buffer.setUint8(byteOffset++, 0x69);
    buffer.setUint8(byteOffset++, 0x73);
    buffer.setUint8(byteOffset++, 0x74);
    buffer.setUint8(byteOffset++, 0x30); // 00
    buffer.setUint8(byteOffset++, 0x30);

    //
    let lOffset = byteOffset; // local offset

    for (idx = 0; idx < objCount; idx++) {
        let obj = objlist[idx];
        let marker = markerList[idx];
        let t4 = marker & 0xF0; // 4-bit type value.
        let l4 = marker & 0x0F; // 4-bit length value;
        offsets[idx] = lOffset; // setting the index where the object will be written.

        if (marker === BPLIST_MARKER_NULL) {
            // null
            buffer.setUint8(lOffset++, marker);
        } else if (marker === BPLIST_MARKER_TRUE) {
            // Boolean true
            buffer.setUint8(lOffset++, marker);
        } else if (marker === BPLIST_MARKER_FALSE) {
            // Boolean false
            buffer.setUint8(lOffset++, marker);
        } else if (t4 === BPLIST_MARKER_INT) {
            // Integer values; i8, i16, i32, i64
            buffer.setUint8(lOffset++, marker);
            // writing the integer value.
            if (l4 === 0) {
                buffer.setUint8(lOffset++, obj);
            } else if (l4 === 1) {
                buffer.setUint16(lOffset, obj);
                lOffset += 2;
            } else if (l4 === 2) {
                buffer.setUint32(lOffset, obj);
                lOffset += 4;
            } else if (l4 === 3) {
                buffer.setBigInt64(lOffset, typeof obj == "bigint" ? obj : BigInt(obj));
                lOffset += 8;
            } else {
                throw new Error("Unhanled integer case");
            }

            //lOffset += writeInteger(buffer, lOffset, obj, byteSize)
            //lOffset += appendInt(buffer, lOffset, obj);
        } else if (t4 === BPLIST_MARKER_REAL) {
            // Float values; f32, f64

            // okey, how the f*** does one determine which byte length is needed for a float.
            // write default as 64-bit float until better implementation can be made.
            buffer.setUint8(lOffset++, marker);
            if (l4 === 2) {           // 32-bit float
                buffer.setFloat32(lOffset, obj);
                lOffset += 4;
            } else if (l4 === 3) {     // 64-bit double
                buffer.setFloat64(lOffset, obj);
                lOffset += 8;
            }
        } else if (t4 === BPLIST_MARKER_UID) {
            // The UID type is used by the archiver/unarchiver and are local indexes in the flat array provided by it.
            // the length 4-bit + 1 is equal to the number of bytes.
            buffer.setUint8(lOffset++, marker);
            if (l4 === 0) {
                buffer.setUint8(lOffset++, obj);
            } else if (l4 === 1) {
                buffer.setUint16(lOffset, obj);
                lOffset += 2;
            } else if (l4 === 3) {
                buffer.setUint32(lOffset, obj);
                lOffset += 4;
            } else if (l4 === 7) {
                buffer.setUint64(lOffset, obj);
                lOffset += 4;
            } else if (l4 === 15) {
                throw new TypeError("128-bit integer are not supported!");
                // 128-bit is not supported in JavaScript
            }
        } else if (marker === BPLIST_MARKER_DATE) {
            // Date
            let f64 = CFDateGetAbsoluteTime(obj);
            buffer.setUint8(lOffset++, marker);
            buffer.setFloat64(lOffset, f64);
            lOffset += 8;
        } else if (t4 == BPLIST_MARKER_DATA) {
            // CFData, Binary Data
            len = obj.byteLength;
            buffer.setUint8(lOffset++, marker);
            let sourceStart = undefined;
            let sourceLength = undefined;
            let sourceBytes = obj;
            // getting the referenced ArrayBuffer for typed arrays such Int32Array, DataView and more.
            if (obj.buffer instanceof ArrayBuffer) {
                sourceBytes = obj.buffer;
                sourceStart = obj.byteOffset;
                sourceLength = obj.byteLength;
            }
            if (l4 === 0x0F) {
                lOffset += appendInt(buffer, lOffset, len);
            }

            // append bytes from the buffer.
            appendArrayBuffer(buffer, lOffset, sourceBytes, sourceStart, sourceLength);
            lOffset += len;
        } else if (t4 === BPLIST_MARKER_ASCII_STRING) {
            // ASCII Strings
            buffer.setUint8(lOffset++, marker);

            // getting the string length
            len = obj.length;

            if (l4 === 0x0F) {
                lOffset += appendInt(buffer, lOffset, len);
            }

            //
            for (let i = 0;i < len;i++) {
                let b = obj.charCodeAt(i);
                buffer.setUint8(lOffset++, b);
            }

        } else if (t4 === BPLIST_MARKER_UNICODE_16_STRING) {
            // UTF-16 Strings


            // getting the string length
            len = obj.length; // surrogate pairs are exposed in the length. \uD83C + \uDC00 are displayed as one char but
                              // but is represented as 2 chars in .length & charCodeAt() and its the same within the target
                              // encoding format.

            buffer.setUint8(lOffset++, marker);

            if (l4 === 0x0F) {
                lOffset += appendInt(buffer, lOffset, len);
            }

            let i16;

            for (let i = 0; i < len; i++) {
                let i16 = obj.charCodeAt(i);
                buffer.setUint16(lOffset, i16);
                lOffset += 2;
                // @todo could do validation of code point ranges here.
            }

        } else if (t4 === BPLIST_MARKER_ARRAY || t4 === BPLIST_MARKER_SET) {
            // Array or Set
            len = obj.length; // These 3 types are converted to the same ref structure by the flaterner.

            buffer.setUint8(lOffset++, marker);
            if (l4 === 0x0F) {
                lOffset += appendInt(buffer, lOffset, len);
            }

            for (idx2 = 0;idx2 < len;idx2++) {
                let refIdx = obj[idx2];
                writeInteger(buffer, lOffset, refIdx, objectRefSize);
                lOffset += objectRefSize;
            }
        } else if (t4 === BPLIST_MARKER_DICT) {
            // Dictionary
            let pairs = obj.length * 0.5; // These 3 types are converted to the same ref structure by the flaterner.

            buffer.setUint8(lOffset++, marker);
            if (l4 === 0x0F) {
                lOffset += appendInt(buffer, lOffset, pairs);
            }

            len = obj.length;

            for (idx2 = 0;idx2 < len;idx2++) {
                let refIdx = obj[idx2];
                writeInteger(buffer, lOffset, refIdx, objectRefSize);
                lOffset += objectRefSize;
            }
        }
    } // end of loop

    // Setting the current byte-offset, which is the byte position of object offset table.
    trailer.offsetTableOffset = lOffset;

    // writes the offset table.
    for (idx = 0;idx < objCount;idx++) {
        let offset = offsets[idx];
        switch (offsetIntSize) {
            case 1:
                buffer.setUint8(lOffset++, offset);
                break;
            case 2:
                buffer.setUint16(lOffset, offset);
                lOffset += 2;
                break;
            case 4:
                buffer.setUint32(lOffset, offset);
                lOffset += 4;
                break;
        }
    }

    // Writes the trailer, structured as following:
    //
    //   uint8_t  _unused[5];
    //   uint8_t  _sortVersion;
    //   uint8_t  _offsetIntSize;
    //   uint8_t  _objectRefSize;
    //   uint64_t _numObjects;
    //   uint64_t _topObject;
    //   uint64_t _offsetTableOffset;
    //

    let sortVersion = 0x00;

    // At the trailer chunk there is 5 unused bytes + sort version, which makes it 6-bytes.
    buffer.setUint32(lOffset, 0);
    lOffset += 4;
    buffer.setUint8(lOffset++, 0);

    buffer.setUint8(lOffset++, sortVersion); // sort version, unknown usage.
    buffer.setUint8(lOffset++, trailer.offsetIntSize);
    buffer.setUint8(lOffset++, trailer.objectRefSize);

    // writes the number of objects in the offset table (uint64)
    buffer.setUint32(lOffset, 0);
    lOffset += 4;
    buffer.setUint32(lOffset, trailer.objectCount);
    lOffset += 4;

    // writes the offset to the top-level object (uint64)
    buffer.setUint32(lOffset, 0);
    lOffset += 4;
    buffer.setUint32(lOffset, trailer.rootObjectIdx);
    lOffset += 4;


    // writes the offset to the offset table (uint64)
    buffer.setUint32(lOffset, 0);
    lOffset += 4;
    buffer.setUint32(lOffset, trailer.offsetTableOffset);
    lOffset += 4;

    return bytes;
}



function writeInteger(buffer, byteOffset, value, byteSize) {
    switch (byteSize) {
        case 1:
            buffer.setUint8(byteOffset, value);
            break;
        case 2:
            buffer.setUint16(byteOffset, value);
            break;
        case 4:
            buffer.setUint32(byteOffset, value);
            break;
        case 8:
            buffer.setBigInt64(byteOffset, value);
            break;
        default:
            throw new TypeError("can't write " + (8 * len) + "-bit integer");
    }

    return byteSize;
}


/**
 * @private
 *
 * Utility method that copies a given range of a ArrayBuffer into another ArrayBuffer at a given offset.
 *
 * @param  {DataView} toData
 * @param  {Int} writeOffset
 * @param  {ArrayBuffer|DataView} fromData
 * @param  {Int} readOffset
 * @param  {Int} readLength
 * @return {void}
 */
function appendArrayBuffer(toData, writeOffset, fromData, readOffset, readLength) {

    let dOffset = writeOffset;
    let sOffset = typeof readOffset !== "number" ? 0 : readOffset;

    let sData;

    if (fromData instanceof ArrayBuffer) {
        sData = new DataView(fromData);
    } else if (fromData instanceof DataView) {
        sData = fromData;
    } else {
        console.error("Unsupported ArrayBuffer type!");
    }

    let endIndex = typeof readLength !== "number" ? sData.byteLength : readLength;
    endIndex += sOffset;
    while (sOffset < endIndex) {
        let b = sData.getUint8(sOffset++);
        toData.setUint8(dOffset++, b);
    }

    return;
}



/**
 * @class
 *
 * A object types which is used to temporary hold a integer value with metadata about byte-size and signed/unsigned.
 */
export class CFIntegerRef {
    
    /**
     * 
     *
     * @param {Int}
     * @param {String}
     */
    constructor(value, type) {
        this.value = value;
        this.type = type;
    }
}

/**
 * @private
 *
 * Internaly used by the encoder to create a object table for the plist to encode.
 *
 * The initial call is med from the CFBinaryPlistWrite() which provides the following arguments for
 * objlist, markerList, objRefMap, uniqeUIDMap which are used and populated troughout the flatterning of
 * the object hierachy.
 *
 * @param  {Object} plist A object or value that can be serialized into a binary plist.
 * @param  {Array} objlist A flat list of objects, the indexes are in sync with markerList.
 * @param  {Array} markerList In paralell with `objlist` and contains the marker byte for each object to be encoded.
 * @param  {Map} objRefMap
 * @param  {Array} uniqeUIDMap A Map instance which maps each first found UID.uid to its object instance.
 * @return {Int} Returns the index for (within objlist array) which where the object/value passed by the `plist` argument where or is encoded.
 */
function getFlatObjectLists(plist, objlist, markerList, objRefMap, uniqeUIDMap, archiveFn) {
    // plist: -    the current object or primitive to flattern into objlist.
    // objlist:    idx -> object/value (flat hierarchy of from the root object)
    // markerList: idx -> marker       (used if the index is pointing to another index)
    // objRefMap:  object -> idx       (index within objlist where its defined)
    // uniqeUIDMap CFUID.uid -> CFUID instance. Used to match multiple instances referencing the same uid to the first instance encoded.
    let refIdx, selfIdx, count, list;
    let marker = getBPlistMarker(plist);
    let hasArchiveFn = typeof archiveFn == "function";

    let t4 = marker & 0xF0;

    if (marker == 0x13) { // 64-bit integer
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;
        return selfIdx;
    } else if (marker === BPLIST_MARKER_DATE) {
        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;
        objRefMap.set(plist, selfIdx);

        return selfIdx;
    } else if (marker === BPLIST_MARKER_NULL || marker === BPLIST_MARKER_TRUE || marker === BPLIST_MARKER_FALSE) {
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;
        return selfIdx;
    }


    if (t4 === BPLIST_MARKER_INT) {
        selfIdx = objlist.length;
        if (plist instanceof CFIntegerRef) {
            // CFIntegerRef are handled by reference.
            refIdx = objRefMap.get(plist);
            if (refIdx !== undefined) {
                return refIdx;
            }
            objlist[selfIdx] = plist.value;
            markerList[selfIdx] = marker;

            objRefMap.set(plist, selfIdx);

        } else {
            // regular integers.
            objlist[selfIdx] = plist;
            markerList[selfIdx] = marker;
        }
        return selfIdx;
    } else if (t4 === BPLIST_MARKER_REAL) {
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;
        return selfIdx;
    } else if (t4 === BPLIST_MARKER_ASCII_STRING) {
        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;

        objRefMap.set(plist, selfIdx);

        return selfIdx;
    } else if (t4 === BPLIST_MARKER_UNICODE_16_STRING) {
        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;

        objRefMap.set(plist, selfIdx);

        return selfIdx;
    } else if (t4 === BPLIST_MARKER_UID) {
        let idValue = plist.uid;
        refIdx = undefined;
        //refIdx = objRefMap.get(plist);


        // according to analyzing the data, UID are leaked trough even if their reference is not used.
        // possible is that older version doesn't handle referencing UID(s).
        selfIdx = objlist.length;
        objlist[selfIdx] = idValue;
        markerList[selfIdx] = marker;

        if (uniqeUIDMap.has(idValue) == true) {
            let replacementObj = uniqeUIDMap.get(idValue);
            refIdx = objRefMap.get(replacementObj);
            return refIdx;
        } else {
            objRefMap.set(plist, selfIdx);
            uniqeUIDMap.set(idValue, plist);
            return selfIdx;
        }

    } else if (t4 === BPLIST_MARKER_DATA) {
        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }
        selfIdx = objlist.length;
        objlist[selfIdx] = plist;
        markerList[selfIdx] = marker;

        objRefMap.set(plist, selfIdx);

        return selfIdx;
    } else if (t4 === BPLIST_MARKER_ARRAY) {
        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }
        let len = plist.length;
        let replacementRef = [];
        // need to set ref structure here as there might be recursive references inside.
        selfIdx = objlist.length;
        objlist[selfIdx] = replacementRef;
        markerList[selfIdx] = marker;
        refIdx = objRefMap.set(plist, selfIdx);

        for (let i = 0;i < len;i++) {
            let valIdx = getFlatObjectLists(plist[i], objlist, markerList, objRefMap, uniqeUIDMap, archiveFn);
            replacementRef.push(valIdx);
        }

        // @todo how to handle these?
        // objlist[selfIdx] should it be a Array of Reference indexes for values?
        return selfIdx;
    } else if (t4 === BPLIST_MARKER_SET) {
        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }

        let replacementRef = [];
        // need to set ref structure here as there might be recursive references inside.
        selfIdx = objlist.length;
        objlist[selfIdx] = replacementRef;
        markerList[selfIdx] = marker;
        refIdx = objRefMap.set(plist, selfIdx);

        let iterator = plist[Symbol.iterator]();

        for (let item of iterator) {
            let valIdx = getFlatObjectLists(item, objlist, markerList, objRefMap, uniqeUIDMap, archiveFn);
            replacementRef.push(valIdx);
        }

        return selfIdx;
    } else if (t4 === BPLIST_MARKER_DICT) {

        refIdx = objRefMap.get(plist);
        if (refIdx !== undefined) {
            return refIdx;
        }

        let replacementRef = [];
        // need to set ref structure here as there might be recursive references inside.
        selfIdx = objlist.length;
        objlist[selfIdx] = replacementRef;
        markerList[selfIdx] = marker;
        refIdx = objRefMap.set(plist, selfIdx);

        let keys = [];
        let vals = [];

        if (plist instanceof Map) {
            let iterator = plist[Symbol.iterator]();

            for (let item of iterator) {
                keys.push(item[0]);
                vals.push(item[1]);
            }
        } else {
            // implements archiver right into the plist serializer.
            if (hasArchiveFn) {
                let cls = archiveFn(plist);
                if (typeof cls == "string") {
                    keys.push(BPLIST_CLASS_KEY);
                    vals.push(cls);
                }
            }
            // TODO: how to handle property name conflict with BPLIST_CLASS_KEY
            let dict = plist;
            if (typeof dict.toJSON == "function") {
                dict = dict.toJSON();
                if (dict === null || typeof dict != "object") {
                    throw new TypeError(".toJSON to return value of type object");
                }
            }
            for (let key in dict) {
                if (dict.hasOwnProperty(key) === false) {
                    continue;
                }
                let val = dict[key];
                if (val === undefined) {
                    continue;
                }
                keys.push(key);
                vals.push(val);
            }
        }

        let len = keys.length;

        for (let i = 0;i < len;i++) {
            let refIdx = getFlatObjectLists(keys[i], objlist, markerList, objRefMap, uniqeUIDMap, archiveFn);
            replacementRef.push(refIdx);
        }

        for (let i = 0;i < len;i++) {
            let refIdx = getFlatObjectLists(vals[i], objlist, markerList, objRefMap, uniqeUIDMap, archiveFn);
            replacementRef.push(refIdx);
        }

        return selfIdx;
    } else {
        console.error("Unandled Case found");
        throw new Error("Unsupported Marker");
    }
}
