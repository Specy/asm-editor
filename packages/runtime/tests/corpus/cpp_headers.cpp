// The C++ wrapper headers: names in namespace std from <cstdio>, <cstdlib>, <cstring>, <cctype>, <climits>,
// <cfloat>, <cstdint>, <cinttypes>, <cstddef>, <cstdarg>, <ctime>, <cerrno> and <cassert>.
#include <cassert>
#include <cctype>
#include <cerrno>
#include <cfloat>
#include <cinttypes>
#include <climits>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>

static int forward(const char *fmt, ...)
{
	std::va_list ap;
	va_start(ap, fmt);
	char buf[64];
	int r = std::vsnprintf(buf, sizeof buf, fmt, ap);
	va_end(ap);
	std::puts(buf);
	return r;
}

static int compare(const void *a, const void *b)
{
	return *static_cast<const int *>(a) - *static_cast<const int *>(b);
}

int main()
{
	std::printf("printf %d %s\n", 1, "two");
	std::size_t len = std::strlen("length");
	std::printf("strlen %zu strcmp sign %d\n", len, std::strcmp("a", "b") < 0);
	char buf[16];
	std::strcpy(buf, "abc");
	std::strcat(buf, "def");
	std::printf("buf %s toupper %c isdigit %d\n", buf, std::toupper('q'), std::isdigit('7') != 0);
	std::printf("abs int %d long %ld long long %lld double %g\n", std::abs(-3), std::abs(-4L), std::abs(-5LL), std::abs(-2.5));
	std::div_t d = std::div(17, 5);
	std::ldiv_t ld = std::div(17L, -5L);
	std::printf("div %d %d ldiv %ld %ld\n", d.quot, d.rem, ld.quot, ld.rem);
	int v[] = { 5, 3, 9, 1 };
	std::qsort(v, 4, sizeof v[0], compare);
	std::printf("qsort %d %d %d %d\n", v[0], v[1], v[2], v[3]);
	std::printf("strtol %ld atoi %d\n", std::strtol("0x10", nullptr, 16), std::atoi("12"));
	std::int32_t i32 = INT32_MAX;
	std::uint64_t u64 = UINT64_MAX;
	std::printf("int32 %" PRId32 " uint64 %" PRIu64 " INT_MAX %d DBL_DIG %d\n", i32, u64, INT_MAX, DBL_DIG);
	std::ptrdiff_t pd = &v[3] - &v[0];
	std::nullptr_t np = nullptr;
	std::printf("ptrdiff %td nullptr %d\n", pd, np == nullptr);
	std::time_t epoch = 0;
	std::tm *t = std::gmtime(&epoch);
	std::printf("gmtime year %d\n", t->tm_year + 1900);
	errno = 0;
	std::strtol("99999999999999999999999", nullptr, 10);
	std::printf("errno ERANGE %d\n", errno == ERANGE);
	assert(len == 6);
	std::printf("forward returned %d\n", forward("forwarded %s %d", "text", 3));
	void *mem = std::malloc(10);
	std::memset(mem, 0, 10);
	std::free(mem);
	std::printf("getenv null %d\n", std::getenv("AED_RUNTIME_SURELY_UNSET") == nullptr);
	return 0;
}
