/* <stdint.h> types and limits, the INTn_C macros, and <inttypes.h> PRI and SCN macros for printing and scanning
 * every width. */
#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>

int main(void)
{
	printf("sizes: %d %d %d %d\n", (int)sizeof(int8_t), (int)sizeof(int16_t), (int)sizeof(int32_t), (int)sizeof(int64_t));
	printf("INT8 %" PRId8 " %" PRId8 " UINT8 %" PRIu8 "\n", (int8_t)INT8_MIN, (int8_t)INT8_MAX, (uint8_t)UINT8_MAX);
	printf("INT16 %" PRId16 " %" PRId16 " UINT16 %" PRIu16 "\n", (int16_t)INT16_MIN, (int16_t)INT16_MAX, (uint16_t)UINT16_MAX);
	printf("INT32 %" PRId32 " %" PRId32 " UINT32 %" PRIu32 " %" PRIx32 " %" PRIX32 " %" PRIo32 "\n", INT32_MIN, INT32_MAX,
		UINT32_MAX, UINT32_MAX, (uint32_t)0xabcdef, (uint32_t)8);
	printf("INT64 %" PRId64 " %" PRId64 " UINT64 %" PRIu64 " %" PRIx64 "\n", INT64_MIN, INT64_MAX, UINT64_MAX,
		UINT64_C(0x0123456789abcdef));
	printf("C macros: %" PRId32 " %" PRIu32 " %" PRId64 " %" PRIu64 " %" PRIdMAX " %" PRIuMAX "\n", INT32_C(-5),
		UINT32_C(5), INT64_C(-9000000000), UINT64_C(18000000000), INTMAX_C(-1), UINTMAX_C(1));
	printf("least/fast: %" PRIdLEAST8 " %" PRIdLEAST16 " %" PRIdLEAST32 " %" PRIdLEAST64 " %" PRIdFAST8 " %" PRIdFAST16
		" %" PRIdFAST32 " %" PRIdFAST64 "\n", (int_least8_t)-8, (int_least16_t)-16, (int_least32_t)-32,
		(int_least64_t)-64, (int_fast8_t)8, (int_fast16_t)16, (int_fast32_t)32, (int_fast64_t)64);
	printf("max: %" PRIdMAX " %" PRIuMAX "\n", INTMAX_MIN, UINTMAX_MAX);
	int x = 5;
	intptr_t ip = (intptr_t)&x;
	uintptr_t up = (uintptr_t)&x;
	printf("intptr round trip: %d %d\n", *(int *)ip == 5, (int *)up == &x);
	printf("SIZE_MAX consistent: %d PTRDIFF consistent: %d\n", SIZE_MAX == (size_t)-1, PTRDIFF_MAX == INTPTR_MAX);
	int8_t a8;
	int16_t a16;
	int32_t a32;
	int64_t a64;
	uint64_t u64;
	uint32_t x32;
	int n = sscanf("-100 -30000 -2000000000 -9000000000000000000 18000000000000000000 ff", "%" SCNd8 " %" SCNd16
		" %" SCNd32 " %" SCNd64 " %" SCNu64 " %" SCNx32, &a8, &a16, &a32, &a64, &u64, &x32);
	printf("scanned %d: %" PRId8 " %" PRId16 " %" PRId32 " %" PRId64 " %" PRIu64 " %" PRIu32 "\n", n, a8, a16, a32, a64, u64,
		x32);
	return 0;
}
