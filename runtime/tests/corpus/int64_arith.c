/* 64-bit integer arithmetic. On 32-bit Targets GCC compiles division, remainder, variable shifts, conversions
 * to and from floating point and bit counts into calls to the library's helper routines. */
#include <stdio.h>
#include <stdint.h>

/* volatile keeps the compiler from computing the results at compile time */
static volatile int64_t sv[] = { 0, 1, -1, 7, -7, 1000000007, -1000000007, 4294967296LL, -4294967297LL,
	INT64_MAX, INT64_MIN, 0x123456789abcdefLL, -0x123456789abcdefLL, 999999999999LL };
static volatile uint64_t uv[] = { 0, 1, 2, 10, 0xffffffffu, 0x100000000ULL, 0xdeadbeefcafebabeULL, UINT64_MAX,
	1000000000000000000ULL, 12345678901234567890ULL };
static volatile double dv[] = { 0.0, 0.5, -0.5, 1.5, -1.5, 4294967296.5, -4294967296.5, 9007199254740993.0,
	1e18, -1e18, 9.2e18, -9.2e18, 123456789.987 };
static volatile int shifts[] = { 0, 1, 7, 31, 32, 33, 63 };

int main(void)
{
	int ns = sizeof sv / sizeof *sv, nu = sizeof uv / sizeof *uv;
	for (int i = 0; i < ns; i++)
		for (int j = 0; j < ns; j++) {
			int64_t a = sv[i], b = sv[j];
			if (b == 0 || (a == INT64_MIN && b == -1)) continue;
			printf("%lld / %lld = %lld r %lld\n", (long long)a, (long long)b, (long long)(a / b), (long long)(a % b));
		}
	for (int i = 0; i < nu; i++)
		for (int j = 0; j < nu; j++) {
			uint64_t a = uv[i], b = uv[j];
			if (b == 0) continue;
			printf("%llu / %llu = %llu r %llu\n", (unsigned long long)a, (unsigned long long)b,
				(unsigned long long)(a / b), (unsigned long long)(a % b));
		}
	for (int i = 0; i < nu; i++)
		for (int k = 0; k < 7; k++) {
			int s = shifts[k];
			uint64_t a = uv[i];
			printf("%llx << %d = %llx, >> = %llx, sar = %lld\n", (unsigned long long)a, s, (unsigned long long)(a << s),
				(unsigned long long)(a >> s), (long long)((int64_t)a >> s));
		}
	for (int i = 0; i < ns; i++) {
		int64_t a = sv[i];
		printf("%lld * 3 = %lld, * itself = %lld, to double %.17g, to float %.9g\n", (long long)a, (long long)(a * 3),
			(long long)(a * a), (double)a, (double)(float)a);
	}
	for (int i = 0; i < nu; i++) {
		uint64_t a = uv[i];
		printf("%llu to double %.17g to float %.9g popcount=%d clz=%d ctz=%d bswap=%llx\n", (unsigned long long)a,
			(double)a, (double)(float)a, __builtin_popcountll(a), a ? __builtin_clzll(a) : -1,
			a ? __builtin_ctzll(a) : -1, (unsigned long long)__builtin_bswap64(a));
	}
	for (unsigned i = 0; i < sizeof dv / sizeof *dv; i++) {
		double d = dv[i];
		printf("%.17g to int64 %lld", d, (long long)(int64_t)d);
		if (d > -1.0) printf(" to uint64 %llu", (unsigned long long)(uint64_t)d);
		printf(" float to int64 %lld\n", (long long)(int64_t)(float)d);
	}
	uint32_t w = 0x80f00001u;
	printf("32-bit: popcount=%d clz=%d ctz=%d bswap=%x\n", __builtin_popcount(w), __builtin_clz(w), __builtin_ctz(w),
		__builtin_bswap32(w));
	return 0;
}
