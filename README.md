# bplist serialization for JavaScript

The [bplist](https://en.wikipedia.org/wiki/Property_list) serialization format unlike many other serialization format support object references, in such that if the same object apprears as a value more than once it uses the same reference in both places. This implementation also support recursive references to objects (not sure how AppKit or CoreFoundation handles such).

The history behind this implementation started in 2012 and I've since then used it in a variation of my own projects that needs to be able to serialize data in a more efficient and lightweight way than what's offered by JSON/BSON.

Historically the bplist format have been the goto for many diffrent areas, it have been used for everything from xpc, application state serialization, file format and also a `*.webarchive` file is simply a binary plist.

### Disclaimer 

The implementation was initialy based based on the specification as supplied in [CFBinaryPList.c](https://opensource.apple.com/source/CF/CF-550/CFBinaryPList.c.auto.html) at line 200.

use of this software is on your own risk, its provided here without warranty of any kind, expressed or implied, including but not limited to the warranties of merchantability, dataloss, fitness for a particular purpose and noninfringement. in no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from,
out of or in connection with the software or the use or other dealings in the software.

### Deviations

As bplist specifies that 32-bit integers are always encoded as unsigned, meaning that any integer that has a negative value such as `-1` will be encoded as a 64-bit integer. Since JavaScript requires explicit handling of `BigInt` in all operations, the walkaround is to check for if the value is in range of `INT32_MIN` and `INT32_MAX` in which case the value is cast to regular integer value using `Number(value)` which in many runtimes is held as a explicit integer and not a 53-bit float. This reduces the need for explicit compare cases for both number and `BigInt` in the implementation that handles object derived from a bplist deserialization.

### TODO

- Add support for later specification, which I suppose was added at the point where the platform was transitioned to swift, adding a few new types for url, utf8 and uuid. Specification for the new addition can be found in following link [CFBinaryPList.c](https://opensource.apple.com/source/CF/CF-855.17/CFBinaryPList.c.auto.html) at line 240.

### Conventions

There is a couple of convention ontop of the serialization format itself. 

- any dictionary might have the `$cls` key in which case the value of such key indicates the class of the resulting object.
- If a `toJSON()` function is found on the object or the prototype chain; a call is made to this function in order to supply a object which is encoded. *[archiveFn has a higher priority]*

### Usage

```typescript
import { CFBinaryPlistWrite } from "bplist.js"

CFBinaryPlistWrite(plist: any): ArrayBuffer

CFBinaryPlistWrite(plist: any, archiveFn: => (object: object):string? ): ArrayBuffer
```

The writting operation is done in two passes where the first simply creates a object reference table alongside computing the size need for the byte buffer, which avoids incremental resize of the output buffer.  
The callback provided in the `archiveFn` argument supplies a string value that will be put into the `$cls` property of the dictinary object.

```typescript
import { CFBinaryPlistRead } from "bplist.js"

CFBinaryPlistRead(rawData: ArrayBuffer|TypedArray): object

CFBinaryPlistRead(rawData: ArrayBuffer|TypedArray, byteOffset: integer, byteLength: integer, unarchiveFn: => (obj: object): object): object
```

Implementation of `unarchiveFn` should itself read the `$cls` property of the supplied object in `obj` argument and resolve it to a class of which a instance should be allocated by the callback itself, the implementation is also responsible for copying of the properties to the replacement object.

