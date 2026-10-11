/* Checks the compiler support routines in src/libgcc against the host's native 64-bit arithmetic, over edge
 * values and many pseudo-random ones. Built for x86-64 against glibc and linked with the library's objects. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int64_t __divdi3(int64_t, int64_t);
int64_t __moddi3(int64_t, int64_t);
uint64_t __udivdi3(uint64_t, uint64_t);
uint64_t __umoddi3(uint64_t, uint64_t);
uint64_t __udivmoddi4(uint64_t, uint64_t, uint64_t *);
int64_t __divmoddi4(int64_t, int64_t, int64_t *);
int64_t __muldi3(int64_t, int64_t);
int64_t __ashldi3(int64_t, int);
int64_t __ashrdi3(int64_t, int);
int64_t __lshrdi3(int64_t, int);
int64_t __fixdfdi(double);
uint64_t __fixunsdfdi(double);
int64_t __fixsfdi(float);
uint64_t __fixunssfdi(float);
double __floatdidf(int64_t);
double __floatundidf(uint64_t);
float __floatdisf(int64_t);
float __floatundisf(uint64_t);
int __clzsi2(uint32_t);
int __ctzsi2(uint32_t);
int __popcountsi2(uint32_t);
int __clzdi2(uint64_t);
int __ctzdi2(uint64_t);
int __popcountdi2(uint64_t);
int32_t __bswapsi2(int32_t);
int64_t __bswapdi2(int64_t);

static long checks, failures;

#define CHECK(cond, fmt, ...) do { \
	checks++; \
	if (!(cond)) { if (failures++ < 30) printf("FAIL " fmt "\n", __VA_ARGS__); } \
} while (0)

static uint64_t state = 0x9e3779b97f4a7c15ull;
static uint64_t next(void)
{
	state ^= state << 13;
	state ^= state >> 7;
	state ^= state << 17;
	return state;
}

/* Values with interesting shapes: random bits masked to a random width, plus sign changes. */
static uint64_t shaped(void)
{
	uint64_t r = next();
	int width = next() % 65;
	if (width < 64) r &= (1ull << width) - 1;
	return r;
}

static uint64_t edges[64];
static int nedges;

static void add_edges(void)
{
	uint64_t base[] = { 0, 1, 2, 3, 7, 9, 10, 15, 16, 255, 256, 0xffff, 0x10000, 0x10001, 999999999, 1000000000,
		0x7fffffff, 0x80000000, 0xffffffff, 0x100000000ull, 0x100000001ull, 0x7fffffffffffffffull,
		0x8000000000000000ull, 0xffffffffffffffffull, 0xfffffffffffffffeull, 0x123456789abcdefull,
		1ull << 52, (1ull << 53) - 1, 1ull << 53, (1ull << 53) + 1, (1ull << 54) + 3, 0x8000000000000001ull };
	for (unsigned i = 0; i < sizeof base / sizeof *base; i++) edges[nedges++] = base[i];
}

static uint64_t value(long i)
{
	if (i < nedges) return edges[i];
	if (i % 3 == 0) return -shaped();
	return shaped();
}

static void check_division(uint64_t a, uint64_t b)
{
	if (b) {
		uint64_t r;
		CHECK(__udivdi3(a, b) == a / b, "__udivdi3(%#llx, %#llx)", (unsigned long long)a, (unsigned long long)b);
		CHECK(__umoddi3(a, b) == a % b, "__umoddi3(%#llx, %#llx)", (unsigned long long)a, (unsigned long long)b);
		CHECK(__udivmoddi4(a, b, &r) == a / b && r == a % b, "__udivmoddi4(%#llx, %#llx)", (unsigned long long)a, (unsigned long long)b);
		int64_t sa = (int64_t)a, sb = (int64_t)b;
		if (!(sa == INT64_MIN && sb == -1)) {
			CHECK(__divdi3(sa, sb) == sa / sb, "__divdi3(%lld, %lld)", (long long)sa, (long long)sb);
			CHECK(__moddi3(sa, sb) == sa % sb, "__moddi3(%lld, %lld)", (long long)sa, (long long)sb);
			int64_t sr;
			CHECK(__divmoddi4(sa, sb, &sr) == sa / sb && sr == sa % sb, "__divmoddi4(%lld, %lld)", (long long)sa, (long long)sb);
		}
	}
	CHECK(__muldi3((int64_t)a, (int64_t)b) == (int64_t)(a * b), "__muldi3(%#llx, %#llx)", (unsigned long long)a, (unsigned long long)b);
}

static void check_unary(uint64_t a)
{
	for (int s = 0; s < 64; s++) {
		CHECK((uint64_t)__ashldi3((int64_t)a, s) == a << s, "__ashldi3(%#llx, %d)", (unsigned long long)a, s);
		CHECK((uint64_t)__lshrdi3((int64_t)a, s) == a >> s, "__lshrdi3(%#llx, %d)", (unsigned long long)a, s);
		CHECK(__ashrdi3((int64_t)a, s) == (int64_t)a >> s, "__ashrdi3(%#llx, %d)", (unsigned long long)a, s);
	}
	uint32_t lo = (uint32_t)a;
	if (lo) {
		CHECK(__clzsi2(lo) == __builtin_clz(lo), "__clzsi2(%#x)", lo);
		CHECK(__ctzsi2(lo) == __builtin_ctz(lo), "__ctzsi2(%#x)", lo);
	}
	if (a) {
		CHECK(__clzdi2(a) == __builtin_clzll(a), "__clzdi2(%#llx)", (unsigned long long)a);
		CHECK(__ctzdi2(a) == __builtin_ctzll(a), "__ctzdi2(%#llx)", (unsigned long long)a);
	}
	CHECK(__popcountsi2(lo) == __builtin_popcount(lo), "__popcountsi2(%#x)", lo);
	CHECK(__popcountdi2(a) == __builtin_popcountll(a), "__popcountdi2(%#llx)", (unsigned long long)a);
	CHECK((uint32_t)__bswapsi2((int32_t)lo) == __builtin_bswap32(lo), "__bswapsi2(%#x)", lo);
	CHECK((uint64_t)__bswapdi2((int64_t)a) == __builtin_bswap64(a), "__bswapdi2(%#llx)", (unsigned long long)a);

	/* Integer to floating point: the host converts with one correct rounding. */
	double d1 = __floatdidf((int64_t)a), d2 = (double)(int64_t)a;
	double u1 = __floatundidf(a), u2 = (double)a;
	float f1 = __floatdisf((int64_t)a), f2 = (float)(int64_t)a;
	float g1 = __floatundisf(a), g2 = (float)a;
	CHECK(memcmp(&d1, &d2, 8) == 0, "__floatdidf(%lld) = %a, expected %a", (long long)a, d1, d2);
	CHECK(memcmp(&u1, &u2, 8) == 0, "__floatundidf(%llu) = %a, expected %a", (unsigned long long)a, u1, u2);
	CHECK(memcmp(&f1, &f2, 4) == 0, "__floatdisf(%lld) = %a, expected %a", (long long)a, (double)f1, (double)f2);
	CHECK(memcmp(&g1, &g2, 4) == 0, "__floatundisf(%llu) = %a, expected %a", (unsigned long long)a, (double)g1, (double)g2);
}

static void check_double(double x)
{
	if (x > -9223372036854775808.0 && x < 9223372036854775808.0)
		CHECK(__fixdfdi(x) == (int64_t)x, "__fixdfdi(%a)", x);
	if (x > -1.0 && x < 18446744073709551616.0)
		CHECK(__fixunsdfdi(x) == (uint64_t)x, "__fixunsdfdi(%a)", x);
	float f = (float)x;
	if (f > -9223372036854775808.0f && f < 9223372036854775808.0f)
		CHECK(__fixsfdi(f) == (int64_t)f, "__fixsfdi(%a)", (double)f);
	if (f > -1.0f && f < 18446744073709551616.0f)
		CHECK(__fixunssfdi(f) == (uint64_t)f, "__fixunssfdi(%a)", (double)f);
}

int main(void)
{
	add_edges();
	for (int i = 0; i < nedges; i++)
		for (int j = 0; j < nedges; j++)
			check_division(edges[i], edges[j]);
	for (long i = 0; i < 300000; i++) check_division(value(i), value(i * 7 + 3));
	for (long i = 0; i < 40000; i++) check_unary(value(i));

	double specials[] = { 0.0, -0.0, 0.5, -0.5, 0.999999, 1.0, -1.0, 1.5, -1.5, 2.5, 1e-300, 4294967295.5,
		4294967296.0, -4294967296.0, 9007199254740993.0, 9223372036854774784.0, -9223372036854775808.0,
		18446744073709549568.0, 1e18, -1e18, 123456789.987654321 };
	for (unsigned i = 0; i < sizeof specials / sizeof *specials; i++) check_double(specials[i]);
	for (long i = 0; i < 200000; i++) {
		uint64_t bits = next();
		double x;
		memcpy(&x, &bits, 8);
		if (x == x) check_double(x);
		check_double((double)(int64_t)shaped() * (i & 1 ? 1.0 : -1.0) / (double)(1 + (next() & 1023)));
	}
	printf("%ld checks, %ld failures\n", checks, failures);
	return failures != 0;
}
