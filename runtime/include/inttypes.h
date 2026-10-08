/* Runtime library, ABI v1: <inttypes.h>. Length modifiers follow GCC's Linux-style type choices: 64-bit, intmax_t, intptr_t and the
   fast 16/32-bit types are long on LP64 Targets; 64-bit and intmax_t are long long on ILP32 Targets. */
#ifndef _INTTYPES_H
#define _INTTYPES_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#if __SIZEOF_LONG__ == 8
#define __AED_64 "l"
#define __AED_PTR "l"
#define __AED_FAST "l"
#else
#define __AED_64 "ll"
#define __AED_PTR ""
#define __AED_FAST ""
#endif

#define PRId8 "d"
#define PRId16 "d"
#define PRId32 "d"
#define PRId64 __AED_64 "d"
#define PRIdLEAST8 "d"
#define PRIdLEAST16 "d"
#define PRIdLEAST32 "d"
#define PRIdLEAST64 __AED_64 "d"
#define PRIdFAST8 "d"
#define PRIdFAST16 __AED_FAST "d"
#define PRIdFAST32 __AED_FAST "d"
#define PRIdFAST64 __AED_64 "d"
#define PRIdMAX __AED_64 "d"
#define PRIdPTR __AED_PTR "d"

#define PRIi8 "i"
#define PRIi16 "i"
#define PRIi32 "i"
#define PRIi64 __AED_64 "i"
#define PRIiLEAST8 "i"
#define PRIiLEAST16 "i"
#define PRIiLEAST32 "i"
#define PRIiLEAST64 __AED_64 "i"
#define PRIiFAST8 "i"
#define PRIiFAST16 __AED_FAST "i"
#define PRIiFAST32 __AED_FAST "i"
#define PRIiFAST64 __AED_64 "i"
#define PRIiMAX __AED_64 "i"
#define PRIiPTR __AED_PTR "i"

#define PRIo8 "o"
#define PRIo16 "o"
#define PRIo32 "o"
#define PRIo64 __AED_64 "o"
#define PRIoLEAST8 "o"
#define PRIoLEAST16 "o"
#define PRIoLEAST32 "o"
#define PRIoLEAST64 __AED_64 "o"
#define PRIoFAST8 "o"
#define PRIoFAST16 __AED_FAST "o"
#define PRIoFAST32 __AED_FAST "o"
#define PRIoFAST64 __AED_64 "o"
#define PRIoMAX __AED_64 "o"
#define PRIoPTR __AED_PTR "o"

#define PRIu8 "u"
#define PRIu16 "u"
#define PRIu32 "u"
#define PRIu64 __AED_64 "u"
#define PRIuLEAST8 "u"
#define PRIuLEAST16 "u"
#define PRIuLEAST32 "u"
#define PRIuLEAST64 __AED_64 "u"
#define PRIuFAST8 "u"
#define PRIuFAST16 __AED_FAST "u"
#define PRIuFAST32 __AED_FAST "u"
#define PRIuFAST64 __AED_64 "u"
#define PRIuMAX __AED_64 "u"
#define PRIuPTR __AED_PTR "u"

#define PRIx8 "x"
#define PRIx16 "x"
#define PRIx32 "x"
#define PRIx64 __AED_64 "x"
#define PRIxLEAST8 "x"
#define PRIxLEAST16 "x"
#define PRIxLEAST32 "x"
#define PRIxLEAST64 __AED_64 "x"
#define PRIxFAST8 "x"
#define PRIxFAST16 __AED_FAST "x"
#define PRIxFAST32 __AED_FAST "x"
#define PRIxFAST64 __AED_64 "x"
#define PRIxMAX __AED_64 "x"
#define PRIxPTR __AED_PTR "x"

#define PRIX8 "X"
#define PRIX16 "X"
#define PRIX32 "X"
#define PRIX64 __AED_64 "X"
#define PRIXLEAST8 "X"
#define PRIXLEAST16 "X"
#define PRIXLEAST32 "X"
#define PRIXLEAST64 __AED_64 "X"
#define PRIXFAST8 "X"
#define PRIXFAST16 __AED_FAST "X"
#define PRIXFAST32 __AED_FAST "X"
#define PRIXFAST64 __AED_64 "X"
#define PRIXMAX __AED_64 "X"
#define PRIXPTR __AED_PTR "X"

#define SCNd8 "hhd"
#define SCNd16 "hd"
#define SCNd32 "d"
#define SCNd64 __AED_64 "d"
#define SCNdLEAST8 "hhd"
#define SCNdLEAST16 "hd"
#define SCNdLEAST32 "d"
#define SCNdLEAST64 __AED_64 "d"
#define SCNdFAST8 "hhd"
#define SCNdFAST16 __AED_FAST "d"
#define SCNdFAST32 __AED_FAST "d"
#define SCNdFAST64 __AED_64 "d"
#define SCNdMAX __AED_64 "d"
#define SCNdPTR __AED_PTR "d"

#define SCNi8 "hhi"
#define SCNi16 "hi"
#define SCNi32 "i"
#define SCNi64 __AED_64 "i"
#define SCNiLEAST8 "hhi"
#define SCNiLEAST16 "hi"
#define SCNiLEAST32 "i"
#define SCNiLEAST64 __AED_64 "i"
#define SCNiFAST8 "hhi"
#define SCNiFAST16 __AED_FAST "i"
#define SCNiFAST32 __AED_FAST "i"
#define SCNiFAST64 __AED_64 "i"
#define SCNiMAX __AED_64 "i"
#define SCNiPTR __AED_PTR "i"

#define SCNo8 "hho"
#define SCNo16 "ho"
#define SCNo32 "o"
#define SCNo64 __AED_64 "o"
#define SCNoLEAST8 "hho"
#define SCNoLEAST16 "ho"
#define SCNoLEAST32 "o"
#define SCNoLEAST64 __AED_64 "o"
#define SCNoFAST8 "hho"
#define SCNoFAST16 __AED_FAST "o"
#define SCNoFAST32 __AED_FAST "o"
#define SCNoFAST64 __AED_64 "o"
#define SCNoMAX __AED_64 "o"
#define SCNoPTR __AED_PTR "o"

#define SCNu8 "hhu"
#define SCNu16 "hu"
#define SCNu32 "u"
#define SCNu64 __AED_64 "u"
#define SCNuLEAST8 "hhu"
#define SCNuLEAST16 "hu"
#define SCNuLEAST32 "u"
#define SCNuLEAST64 __AED_64 "u"
#define SCNuFAST8 "hhu"
#define SCNuFAST16 __AED_FAST "u"
#define SCNuFAST32 __AED_FAST "u"
#define SCNuFAST64 __AED_64 "u"
#define SCNuMAX __AED_64 "u"
#define SCNuPTR __AED_PTR "u"

#define SCNx8 "hhx"
#define SCNx16 "hx"
#define SCNx32 "x"
#define SCNx64 __AED_64 "x"
#define SCNxLEAST8 "hhx"
#define SCNxLEAST16 "hx"
#define SCNxLEAST32 "x"
#define SCNxLEAST64 __AED_64 "x"
#define SCNxFAST8 "hhx"
#define SCNxFAST16 __AED_FAST "x"
#define SCNxFAST32 __AED_FAST "x"
#define SCNxFAST64 __AED_64 "x"
#define SCNxMAX __AED_64 "x"
#define SCNxPTR __AED_PTR "x"

typedef struct { intmax_t quot; intmax_t rem; } imaxdiv_t;

/** Returns the absolute value of an intmax_t. */
intmax_t imaxabs(intmax_t n);
/** Divides two intmax_t values, returning the quotient and remainder together. */
imaxdiv_t imaxdiv(intmax_t num, intmax_t den);
/** Converts the start of a string to intmax_t in the given base (0 detects 0x and 0 prefixes), storing the end in *end. */
intmax_t strtoimax(const char *str, char **end, int base);
/** Converts the start of a string to uintmax_t in the given base (0 detects 0x and 0 prefixes), storing the end in *end. */
uintmax_t strtoumax(const char *str, char **end, int base);

#ifdef __cplusplus
}
#endif

#endif
