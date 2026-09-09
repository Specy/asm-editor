import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageRoot =
    process.env.ASM_EDITOR_RISCV_PACKAGE_ROOT ??
    join(projectRoot, 'node_modules', '@specy', 'risc-v')
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))

if (packageJson.version !== '3.0.0') {
    throw new Error(
        `The RISC-V file-read patch targets @specy/risc-v 3.0.0, found ${packageJson.version}`
    )
}

const bridgeAnchor = `  $rt_nativeThread().push($this, $fileDescriptor, $buffer, var$3, var$4, var$5, var$6, $ptr);
};
var asr_JsRISCVIO_inputDialog = ($this, $message) => {`

const readBridge = `  $rt_nativeThread().push($this, $fileDescriptor, $buffer, var$3, var$4, var$5, var$6, $ptr);
};
var asr_JsRISCVIO_readFile = ($this, $fileDescriptor, $destination, $length) => {
  let $array, var$5, var$6, var$7, $eof, $buffer, $i, $ptr, $tmp;
  $ptr = 0;
  if ($rt_resuming()) {
    let $thread = $rt_nativeThread();
    $ptr = $thread.pop();
    $i = $thread.pop();
    $buffer = $thread.pop();
    $eof = $thread.pop();
    var$7 = $thread.pop();
    var$6 = $thread.pop();
    var$5 = $thread.pop();
    $array = $thread.pop();
    $length = $thread.pop();
    $destination = $thread.pop();
    $fileDescriptor = $thread.pop();
    $this = $thread.pop();
  }
  main: while (true) {
    switch ($ptr) {
      case 0:
        $array = $rt_str("readFile");
        var$5 = $rt_createArray(jl_Object, 3);
        var$6 = var$5.data;
        var$6[0] = otji_JSWrapper_wrap($fileDescriptor);
        var$7 = $rt_createArray($rt_arraycls($rt_bytecls), 1);
        var$7.data[0] = $destination;
        var$6[1] = otji_JSWrapper_wrap(otjc_JSArray_of(var$7));
        var$6[2] = otji_JSWrapper_wrap($length);
        $ptr = 1;
      case 1:
        $tmp = asr_JsRISCVIO_callHandler($this, $array, var$5);
        if ($rt_suspending()) {
          break main;
        }
        $array = $tmp;
        if (!($array instanceof Array ? 1 : 0) || $array.length != 2) {
          $rt_throw(asrri_RISCVIOError__init_($rt_str("Read file expects a tuple of 2 elements")));
        }
        $eof = otji_JSWrapper_maybeUnwrap($array[0]);
        $buffer = otji_JSWrapper_maybeUnwrap($array[1]);
        $i = 0;
        while ($i < $buffer.length) {
          $destination.data[$i] = otjc_JSNumber_intValue$static(otji_JSWrapper_maybeUnwrap($buffer[$i])) << 24 >> 24;
          $i = $i + 1 | 0;
        }
        return otjc_JSNumber_intValue$static($eof);
      default:
        $rt_invalidPointer();
    }
  }
  $rt_nativeThread().push($this, $fileDescriptor, $destination, $length, $array, var$5, var$6, var$7, $eof, $buffer, $i, $ptr);
};
var asr_JsRISCVIO_inputDialog = ($this, $message) => {`

const readSelectionBefore = `                    if (var$6) {
                      if (var$6 != 1 && var$6 != 2)
                        break a;
                      $rt_throw(asrri_RISCVIOError__init_($rt_s(1349)));
                    }
                    $e = asru_SystemIO_io;
                    $ptr = 1;
                    continue main;`

const readSelectionAfter = `                    if (!var$6) {
                      $e = asru_SystemIO_io;
                      $ptr = 1;
                      continue main;
                    }
                    if (var$6 != 1 && var$6 != 2) {
                      $e = asru_SystemIO_io;
                      $ptr = 2;
                      continue main;
                    }
                    $rt_throw(asrri_RISCVIOError__init_($rt_s(1349)));`

const fileReadCase = `      case 2:
        a: {
          e: {
            try {
              b: {
                try {
                  $tmp = asr_JsRISCVIO_readFile($e, var$6, $myBuffer, $length);
                  if ($rt_suspending()) {
                    break main;
                  }
                  $retLength = $tmp;
                  if ($retLength == -1)
                    $retLength = 0;
                  break a;
                } catch ($$e) {
                  $$je = $rt_wrapException($$e);
                  if ($$je instanceof asrri_RISCVIOError) {
                    break b;
                  } else {
                    throw $$e;
                  }
                }
              }
            } catch ($$e) {
              $$je = $rt_wrapException($$e);
              if ($$je instanceof jl_IndexOutOfBoundsException) {
                break e;
              } else {
                throw $$e;
              }
            }
            $e = new jl_StringBuilder();
            jl_AbstractStringBuilder__init_($e);
            jl_AbstractStringBuilder_append0(jl_StringBuilder_append($e, $rt_s(1350)), var$6);
            asru_SystemIO_fileErrorString = jl_AbstractStringBuilder_toString($e);
            $retLength = -1;
            break a;
          }
          $e = new jl_StringBuilder();
          jl_AbstractStringBuilder__init_($e);
          jl_AbstractStringBuilder_append0(jl_StringBuilder_append($e, $rt_s(1351)), var$6);
          asru_SystemIO_fileErrorString = jl_AbstractStringBuilder_toString($e);
          $retLength = -1;
        }
        $myBuffer = $myBuffer.data;
        asrrh_RegisterFile_updateRegister0($rt_s(493), Long_fromInt($retLength));
        f: {
          try {
            while ($index < $retLength) {
              asr_Globals_$callClinit();
              $e = asr_Globals_memory;
              $length = $byteAddress + 1 | 0;
              var$10 = $index + 1 | 0;
              asrrh_Memory_setByte($e, $byteAddress, $myBuffer[$index]);
              $byteAddress = $length;
              $index = var$10;
            }
          } catch ($$e) {
            $$je = $rt_wrapException($$e);
            if ($$je instanceof asrrh_AddressErrorException) {
              $e = $$je;
              break f;
            } else {
              throw $$e;
            }
          }
          return;
        }
        var$9 = new asr_ExitingException();
        asr_SimulationException__init_2(var$9, $statement, $e);
        $rt_throw(var$9);
`

for (const filename of ['index.js', 'index.mjs']) {
    const path = join(packageRoot, 'dist', filename)
    let source = readFileSync(path, 'utf8')
    const alreadyPatched = source.includes('var asr_JsRISCVIO_readFile =')
    if (alreadyPatched) continue

    if (!source.includes(bridgeAnchor))
        throw new Error(`RISC-V patch anchor missing in ${filename}`)
    source = source.replace(bridgeAnchor, readBridge)

    const start = source.indexOf('var asrrs_SyscallRead_simulate =')
    const end = source.indexOf('var asrrs_SyscallWrite =', start)
    if (start < 0 || end < 0) throw new Error(`RISC-V read syscall missing in ${filename}`)
    let syscall = source.slice(start, end)
    if (!syscall.includes(readSelectionBefore)) {
        throw new Error(`RISC-V read selection anchor missing in ${filename}`)
    }
    syscall = syscall.replace(readSelectionBefore, readSelectionAfter)
    const endAnchor = '      default:\n        $rt_invalidPointer();'
    if (!syscall.includes(endAnchor))
        throw new Error(`RISC-V read end anchor missing in ${filename}`)
    syscall = syscall.replace(endAnchor, fileReadCase + endAnchor)
    source = source.slice(0, start) + syscall + source.slice(end)
    writeFileSync(path, source)
}
