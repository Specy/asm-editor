// <cmath> overloads: float overloads return float, integer arguments convert to double, mixed arguments promote,
// std::abs covers floating point, and the classification functions are functions in namespace std.
#include <cmath>
#include <cstdio>
#include <cstdlib>

template <class T> static const char *kind(T) { return "other"; }
template <> const char *kind(float) { return "float"; }
template <> const char *kind(double) { return "double"; }

int main()
{
	std::printf("sqrt(2.0f) is %s = %.6g\n", kind(std::sqrt(2.0f)), std::sqrt(2.0f));
	std::printf("sqrt(2) is %s = %.10g\n", kind(std::sqrt(2)), std::sqrt(2));
	std::printf("pow(2, 10) is %s = %g\n", kind(std::pow(2, 10)), std::pow(2, 10));
	std::printf("pow(2.0f, 3.0f) is %s = %g\n", kind(std::pow(2.0f, 3.0f)), std::pow(2.0f, 3.0f));
	std::printf("pow(2.0f, 3) is %s = %g\n", kind(std::pow(2.0f, 3)), std::pow(2.0f, 3));
	std::printf("abs(-2.5) is %s = %g, abs(-1.5f) is %s\n", kind(std::abs(-2.5)), std::abs(-2.5), kind(std::abs(-1.5f)));
	std::printf("fabs(-3) = %g floor(2.7f) = %g ceil(2) = %g round(2.5) = %g trunc(-2.5f) = %g\n", std::fabs(-3),
		std::floor(2.7f), std::ceil(2), std::round(2.5), std::trunc(-2.5f));
	std::printf("sin(0) = %g cos(0) = %g exp(1) = %.6f log(1) = %g log10(1000) = %g log2(8.0f) = %g\n", std::sin(0),
		std::cos(0), std::exp(1), std::log(1), std::log10(1000), std::log2(8.0f));
	std::printf("atan2(1, 1) = %.10f hypot(3, 4) = %g fmod(7, 3) = %g fmin(1, 2.5) = %g fmax(1.0f, 2.0f) is %s\n",
		std::atan2(1, 1), std::hypot(3, 4), std::fmod(7, 3), std::fmin(1, 2.5), kind(std::fmax(1.0f, 2.0f)));
	int e;
	double m = std::frexp(48, &e);
	float fm = std::frexp(0.75f, &e);
	std::printf("frexp(48) = %g, frexp(0.75f) is %s, ldexp(3, 2) = %g, scalbn(1.0f, 3) = %g\n", m, kind(fm),
		std::ldexp(3, 2), std::scalbn(1.0f, 3));
	float ip;
	float frac = std::modf(3.25f, &ip);
	std::printf("modf(3.25f) = %g + %g copysign(2, -1) = %g cbrt(27.0f) = %g\n", ip, frac, std::copysign(2, -1),
		std::cbrt(27.0f));
	double nan = NAN, inf = HUGE_VAL;
	std::printf("isnan %d %d isinf %d %d isfinite %d signbit %d %d fpclassify zero %d normal %d\n", std::isnan(nan),
		std::isnan(1.0), std::isinf(inf), std::isinf(3), std::isfinite(1.0f), std::signbit(-1.0), std::signbit(2),
		std::fpclassify(0.0) == FP_ZERO, std::fpclassify(5) == FP_NORMAL);
	std::printf("isgreater %d isless(1, 2.0f) %d isunordered %d\n", std::isgreater(2, 1), std::isless(1, 2.0f),
		std::isunordered(nan, 1));
	std::printf("unqualified: %g %g\n", sqrt(9.0), pow(3.0, 2));
	std::printf("M_PI %.10f\n", M_PI);
	return 0;
}
