/* Internal: the byte-order names musl's memcpy.c expects from <endian.h>, taken from GCC's predefined macros. */
#ifndef AED_ENDIAN_H
#define AED_ENDIAN_H

#define __LITTLE_ENDIAN __ORDER_LITTLE_ENDIAN__
#define __BIG_ENDIAN __ORDER_BIG_ENDIAN__
#define __BYTE_ORDER __BYTE_ORDER__

#endif
